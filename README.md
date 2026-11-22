# Sistema de Agendamento para Barbearias

Sistema gratuito e de codigo aberto para gerenciamento de
agendamentos de barbearias.

## Funcionalidades

- Pagina publica de agendamento
- Cadastro de profissionais e servicos
- Consulta de horarios disponiveis
- Painel administrativo
- Prevencao de horarios duplicados
- Confirmacao e comprovante de agendamento
- Banco PostgreSQL independente
- Instalacao com Docker Compose

## Tecnologias

- Next.js
- TypeScript
- PostgreSQL
- Docker e Docker Compose

## Requisitos

- Servidor Linux com Docker e Docker Compose
- Recursos suficientes para executar a aplicacao e o PostgreSQL
- Acesso administrativo ao servidor

Cada instalacao utiliza seu proprio banco de dados.

## Instalacao

### 1. Obter o codigo

Clone o repositorio do projeto e entre na pasta.

### 2. Configurar ambiente

Copie o modelo:

```bash
cp .env.example .env
```

Edite o arquivo `.env` antes de iniciar.

Configure especialmente:

- POSTGRES_PASSWORD
- ADMIN_EMAIL
- ADMIN_PASSWORD
- APP_ORIGIN

Use senhas fortes e exclusivas.

O usuario e o nome do banco precisam permanecer compativeis
com a protecao do instalador nesta versao.

Nunca publique o arquivo `.env`.

### 3. Iniciar PostgreSQL

```bash
docker compose -f compose.yaml -f compose.setup.yaml --profile setup up -d db
```

### 4. Preparar banco e administrador

```bash
docker compose -f compose.yaml -f compose.setup.yaml --profile setup build setup
docker compose -f compose.yaml -f compose.setup.yaml --profile setup run --rm --no-deps setup
```

Execute o instalador somente em um banco novo e isolado.

### 5. Iniciar aplicacao

```bash
docker compose -f compose.yaml up -d --build web
```

### 6. Acessar

A configuracao atual publica a aplicacao somente
em 127.0.0.1:18083 no servidor.

Para acesso publico, configure um proxy reverso
com HTTPS e ajuste APP_ORIGIN para o endereco real.

Nao exponha a porta do PostgreSQL na internet.

## Limitacoes atuais

Esta primeira versao e um sistema de agendamento para uma
barbearia individual. Nao e um SaaS multiempresa.

### Horarios de funcionamento

A API de agendamento utiliza limites definidos no codigo:

- Manha: 09:00 as 12:00
- Horario extra: 12:00 as 12:30, quando permitido
- Tarde: 14:00 as 19:30

Esses limites estao em `src/lib/time.ts`, na funcao
`withinOperatingHours`.

Alterar o horario em uma tela administrativa nao significa
que a API permitira agendamentos fora desses limites.

Os dias de funcionamento e as regras de liberacao semanal
tambem possuem logica especifica na aplicacao.

### Profissionais

O fluxo publico utiliza a funcao `assignedProfessional`
para determinar o profissional a partir do cadastro
e das regras internas.

Esta versao nao deve ser apresentada como um sistema com
escolha inteiramente livre de qualquer profissional.

### Convites e mensagens

A logica de convites semanais possui uma janela de
segunda-feira, no horario de Sao Paulo.

Integracoes de WhatsApp, Meta e outros servicos externos
nao devem ser consideradas prontas para uso sem
configuracao, autorizacao e testes adicionais.

### Personalizacao

Quem desejar horarios, distribuicao de profissionais ou
regras diferentes precisara revisar o codigo correspondente.

Antes de usar com clientes reais, realize testes completos
da agenda e configure suas proprias credenciais.


## Seguranca

- Configure credenciais proprias e exclusivas
- Nao compartilhe arquivos .env
- Nao reutilize bancos de dados de producao
- Utilize HTTPS em instalacoes publicas
- Mantenha imagens e dependencias atualizadas
- Faca backups regulares do banco

## Licenca

Distribuido sob a licenca MIT. Consulte LICENSE.

## Aviso

O software e fornecido sem garantia.
Revise a configuracao e realize testes antes
de utiliza-lo com clientes reais.
