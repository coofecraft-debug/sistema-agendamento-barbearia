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

Esta versao foi preparada a partir de uma agenda
de barbearia individual, nao de um SaaS multiempresa.

Algumas regras de dias e limites de horarios permanecem
fixas no codigo e precisam ser adaptadas para outros
funcionamentos.

A atribuicao de novos clientes ao profissional principal
tambem deve ser revisada conforme a necessidade.

As integracoes de mensagens exigem configuracao
e revisao antes de serem ativadas.

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
