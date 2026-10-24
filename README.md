# GreenCode AV2 — API de logística inversa

Projeto TypeScript de servidor para a atividade AV2. A aplicação expõe uma API REST com Fastify, persiste os dados em PostgreSQL com Prisma ORM e autentica as requisições com JWT.

## Requisitos

- Node.js 20 ou superior
- Docker Desktop com Compose, ou um servidor PostgreSQL próprio

## Instalação e execução

No PowerShell, dentro desta pasta:

```powershell
npm install
Copy-Item .env.example .env
```

Se for usar o PostgreSQL local incluído:

```powershell
docker compose up -d
```

Crie/aplique a migração, gere o Prisma Client e carregue os dados de exemplo:

```powershell
npm run db:deploy
npm run db:generate
npm run db:seed
```

Inicie o servidor:

```powershell
npm run dev
```

A API fica em `http://localhost:3000`; a documentação interativa fica em `http://localhost:3000/docs` e a checagem de saúde em `http://localhost:3000/health`.

O seed cria o usuário `admin@greencode.local` com senha `Greencode@123`. Troque essa senha e o `JWT_SECRET` antes de usar em qualquer ambiente compartilhado. O arquivo `.env` não deve ser enviado ao Git.

## Organização do código

- `src/controllers`: rotas HTTP, validação de entrada e códigos de resposta.
- `src/services`: regras de negócio, autorização de ações e transações.
- `src/repositories`: consultas de persistência feitas pelo Prisma.
- `src/database`: conexão PostgreSQL/Prisma.
- `prisma/schema.prisma`: modelos, relacionamentos, enums e campos de versão.
- `prisma/seed.ts`: massa de dados reproduzível para desenvolvimento.

## API

Todas as rotas estão sob `/api`. Exceto `POST /api/auth/login`, exigem o cabeçalho `Authorization: Bearer <token>`.

| Método        | Rota                           | Acesso                            | Uso                                                       |
| ------------- | ------------------------------ | --------------------------------- | --------------------------------------------------------- |
| `POST`        | `/api/auth/login`              | Público                           | Recebe `{ "email", "password" }` e devolve JWT            |
| `GET`         | `/api/auth/me`                 | Autenticado                       | Consulta o usuário do token                               |
| `GET`         | `/api/users`                   | Admin ou auditor                  | Lista usuários                                            |
| `POST`        | `/api/users`                   | Admin                             | Cria usuário                                              |
| `PATCH`       | `/api/users/:id/role`          | Admin                             | Altera papel com `version`                                |
| `GET`, `POST` | `/api/organizations`           | Autenticado / admin ou cadastro   | Consulta ou cadastra organização                          |
| `PATCH`       | `/api/organizations/:id`       | Admin ou cadastro                 | Atualiza organização com `version`                        |
| `GET`, `POST` | `/api/contracts`               | Autenticado / admin ou cadastro   | Consulta ou cadastra contrato                             |
| `PATCH`       | `/api/contracts/:id`           | Admin ou cadastro                 | Atualiza contrato com `version`                           |
| `GET`, `POST` | `/api/lots`                    | Autenticado / admin ou almoxarife | Consulta ou cria lote e associa equipamentos em transação |
| `PATCH`       | `/api/lots/:id`                | Admin ou almoxarife               | Atualiza lote com `version`                               |
| `GET`, `POST` | `/api/equipment`               | Autenticado / admin ou cadastro   | Consulta ou cadastra equipamento                          |
| `PATCH`       | `/api/equipment/:id/status`    | Admin ou almoxarife               | Transição de estado e movimentação atômicas               |
| `GET`         | `/api/equipment/:id/movements` | Autenticado                       | Histórico do equipamento                                  |
| `GET`         | `/api/reports/summary`         | Admin ou auditor                  | Contagens por estado e valor total de recuperação         |

Consulte `/docs` para esquemas e exemplos gerados automaticamente.

### Exemplo de uso

Obtenha o token:

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login -ContentType 'application/json' -Body '{"email":"admin@greencode.local","password":"Greencode@123"}'
$headers = @{ Authorization = "Bearer $($login.accessToken)" }
```

Cadastre uma organização, depois use o `id` devolvido para cadastrar equipamento:

```powershell
$orgBody = '{"name":"Organização Exemplo","cnpj":"11222333000181","type":"COLETOR","phone":"11999999999","email":"contato@exemplo.local","address":"São Paulo - SP"}'
$org = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/organizations -Headers $headers -ContentType 'application/json' -Body $orgBody

$equipmentBody = @{ internalBarcode='GC-0100'; serial='SERIAL-0100'; category='Notebook'; brand='Exemplo'; model='Modelo A'; condition='Usado'; location='Recepção'; organizationId=$org.id; recoveryValue=150 } | ConvertTo-Json
$equipment = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/equipment -Headers $headers -ContentType 'application/json' -Body $equipmentBody
```

Para colocar o equipamento em um lote, envie seu identificador e sua versão atual. A versão é devolvida no cadastro ou na consulta `GET /api/equipment`:

```powershell
$lotBody = @{
  code = 'LOTE-0100'
  organizationId = $org.id
  origin = 'Unidade Central'
  destination = 'Centro de Triagem'
  equipment = @(@{ id = $equipment.id; version = $equipment.version })
} | ConvertTo-Json -Depth 5

$lot = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/lots -Headers $headers -ContentType 'application/json' -Body $lotBody
```

Associar ao lote incrementa a versão do equipamento. Consulte-o novamente antes de mudar o estado e envie a versão mais recente. A versão impede que uma alteração antiga sobrescreva uma atualização concorrente:

```powershell
$equipment = Invoke-RestMethod -Method Get -Uri http://localhost:3000/api/equipment -Headers $headers | Where-Object { $_.id -eq $equipment.id }
$statusBody = @{ version=$equipment.version; status='EM_TRIAGEM'; location='Triagem'; note='Avaliação inicial' } | ConvertTo-Json
Invoke-RestMethod -Method Patch -Uri "http://localhost:3000/api/equipment/$($equipment.id)/status" -Headers $headers -ContentType 'application/json' -Body $statusBody
```

## Decisões técnicas

- O projeto é um monólito dividido em controller, service e repository, adequado para desenvolver e executar como uma única aplicação.
- Fastify valida corpos e parâmetros por JSON Schema e publica a documentação OpenAPI em `/docs`.
- O PostgreSQL garante chaves estrangeiras e unicidade para CNPJ, códigos de contrato/lote e código interno do equipamento.
- Prisma `$transaction` mantém criação de lote, associação dos equipamentos e movimentações na mesma transação; a mudança de estado do equipamento e seu histórico também são atômicos.
- `version` é incrementada em cada atualização. As operações atualizam apenas quando a versão recebida ainda corresponde à do banco; caso contrário, a API responde `409 Conflict`.
- JWT expira em 30 minutos. Senhas são verificadas com bcrypt e as permissões são aplicadas por papel.
- A API recebe valor de recuperação por equipamento e soma esses valores no resumo financeiro. Não foi inventada uma taxa de depreciação, pois a atividade não especifica uma fórmula.

## Comandos úteis

```powershell
npm run build
npm run db:generate
npm run db:studio
docker compose down
```

Para criar uma nova migração durante o desenvolvimento, use `npm run db:migrate -- --name nome_da_mudanca`.

Para apagar também o volume do banco local e recomeçar do zero, use `docker compose down -v` (isso remove os dados de desenvolvimento).
