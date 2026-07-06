# 🤖 AfiliadoBot — Affiliate HUB

Plataforma de curadoria semi-automática e disparo de ofertas de afiliados (**Mercado Livre** + **Shopee**) via **WhatsApp**, com dashboard moderno multi-workspace/nicho.

---

## ✨ Funcionalidades

- 🛒 **Mercado Livre Afiliados** — OAuth + busca por categoria/keyword/desconto mínimo
- 🛍️ **Shopee Affiliates** — API com HMAC-SHA256 + busca de ofertas
- 💬 **WhatsApp Multi-sessão** — Baileys, 1 número por workspace/nicho
- 📬 **Inbox de Curadoria** — Aprove/rejeite cada oferta antes de enviar
- 📤 **Disparo Assistido** — Envia somente para grupos que você cadastrou
- 🏢 **Multi-workspace** — Vários nichos isolados (Tech, Beauty, Casa…)
- 🔄 **Worker Automático** — Busca ofertas a cada 30 minutos via cron
- ✅ **Conformidade ML** — Sem auto-post, com #publi, tag oficial (sem shortener)

---

## 🧱 Stack

| Camada      | Tecnologia                            |
|-------------|---------------------------------------|
| Backend     | Node 20 + Express + Prisma            |
| Banco       | PostgreSQL 16                         |
| WhatsApp    | @whiskeysockets/baileys               |
| Frontend    | React 18 + Vite + CSS Dark Mode       |
| Tempo real  | WebSocket nativo                      |
| Deploy      | Docker — EasyPanel / VPS              |

---

## 📁 Estrutura do Projeto

```
affiliate-HUB/
├── src/server/
│   ├── index.js              # Entry: Express + WebSocket + worker init
│   ├── db.js                 # PrismaClient singleton
│   ├── auth.js               # Middleware: senha única + cookie de sessão
│   ├── worker.js             # Busca automática de ofertas (cron 30min)
│   ├── formatter.js          # Formata mensagem WhatsApp (com #publi)
│   ├── platforms/
│   │   ├── index.js          # Registry de plataformas (interface comum)
│   │   ├── mercadolivre.js   # ML: OAuth, token refresh, busca, link afiliado
│   │   └── shopee.js         # Shopee: HMAC-SHA256, busca, link afiliado
│   ├── whatsapp/
│   │   └── manager.js        # Multi-sessão Baileys + EventEmitter para QR/status
│   └── routes/
│       ├── auth.js           # POST /api/auth/login|logout, GET /api/auth/me
│       ├── workspaces.js     # CRUD workspaces, WA, grupos, ofertas
│       └── platforms.js      # Config plataformas + ML OAuth callback
├── frontend/
│   ├── src/
│   │   ├── pages/            # Login, Dashboard, WorkspaceDetail
│   │   └── components/       # Layout, OffersInbox, WhatsAppPanel, PlatformConnector
│   ├── index.html
│   └── vite.config.js
├── prisma/
│   └── schema.prisma         # Workspace, WorkspacePlatform, WaGroup, Offer
├── Dockerfile                # Build multi-stage para EasyPanel
├── docker-compose.yml        # Stack completa para VPS
├── .env.example              # Template de variáveis de ambiente
└── README.md
```

---

## 🔑 Variáveis de Ambiente

Copie `.env.example` para `.env` e preencha:

```env
# ── Banco de Dados ──────────────────────────────────────────────
DATABASE_URL="postgresql://user:password@host:5432/afiliadobot"

# ── Autenticação ─────────────────────────────────────────────────
DASHBOARD_PASSWORD="sua-senha-forte-aqui"       # Senha de acesso ao dashboard
SESSION_SECRET="chave-aleatoria-muito-longa"    # Segredo para cookies

# ── Mercado Livre ─────────────────────────────────────────────────
ML_CLIENT_ID=""          # App ID do ML Developers
ML_CLIENT_SECRET=""      # App Secret do ML Developers
ML_REDIRECT_URI=""       # Ex: https://seudominio.com/ml/callback
ML_AFFILIATE_TAG=""      # Sua tag de afiliado (matt_word)

# ── Shopee Affiliates ─────────────────────────────────────────────
SHOPEE_APP_ID=""         # App ID do painel Shopee Affiliate
SHOPEE_SECRET=""         # Secret Key do Shopee Affiliate
SHOPEE_AFFILIATE_TAG=""  # Seu sub_id de rastreio

# ── Aplicação ─────────────────────────────────────────────────────
PORT=3000
NODE_ENV=production
APP_URL="https://seudominio.com"
```

---

## 🚀 Deploy no EasyPanel (Recomendado)

O EasyPanel gerencia containers Docker com interface web. Ideal para quem quer praticidade sem configurar Nginx/SSL manualmente.

### Pré-requisitos
- Servidor VPS com EasyPanel instalado
- Domínio apontando para o servidor (para HTTPS)
- Conta no [ML Developers](https://developers.mercadolivre.com.br/devcenter) e [Shopee Affiliates](https://affiliate.shopee.com.br)

---

### Passo 1 — Criar o serviço PostgreSQL

1. No painel EasyPanel: clique em **+ Criar** → **PostgreSQL**
2. Dê um nome: `afiliadobot-db`
3. Defina uma senha forte para o banco
4. Após criar, vá em **Detalhes** e copie a **Connection String interna** (ex: `postgresql://postgres:senha@afiliadobot-db:5432/afiliadobot`)

---

### Passo 2 — Criar o serviço App

1. Clique em **+ Criar** → **App**
2. Selecione a fonte: **GitHub** → conecte o repositório `GuilhermeAzespo/affiliate-HUB`
3. Branch: `main`
4. Build Method: **Dockerfile** (detectado automaticamente)
5. Porta exposta: **3000**

#### Configurar Volume para sessões WhatsApp

Na aba **Volumes** do serviço App:
- Mount Path: `/app/auth_state`
- Volume Name: `auth-state`

> ⚠️ Este volume é essencial! Sem ele as sessões do WhatsApp são perdidas a cada redeploy.

---

### Passo 3 — Configurar variáveis de ambiente

Na aba **Environment** do serviço App, adicione **todas** as variáveis:

```
DATABASE_URL=postgresql://postgres:SUA_SENHA@afiliadobot-db:5432/afiliadobot
DASHBOARD_PASSWORD=SuaSenhaForte123!
SESSION_SECRET=abc123def456ghi789jkl012mno345pqr
NODE_ENV=production
APP_URL=https://seudominio.com
PORT=3000
ML_CLIENT_ID=
ML_CLIENT_SECRET=
ML_REDIRECT_URI=https://seudominio.com/ml/callback
ML_AFFILIATE_TAG=
SHOPEE_APP_ID=
SHOPEE_SECRET=
SHOPEE_AFFILIATE_TAG=
```

> 💡 Você pode deixar as variáveis do ML/Shopee em branco por agora e preencher depois.

---

### Passo 4 — Configurar Domínio e HTTPS

1. Na aba **Domínios** do serviço App:
   - Adicione seu domínio: `seudominio.com`
   - Ative **HTTPS automático** (Let's Encrypt)
2. Certifique-se que o DNS do domínio aponta para o IP do servidor

---

### Passo 5 — Deploy

1. Clique em **Deploy** no serviço App
2. Acompanhe os logs — o Dockerfile executa automaticamente:
   - Build do frontend React
   - `prisma migrate deploy` (cria as tabelas)
   - Inicia o servidor Node
3. Acesse `https://seudominio.com` → Tela de login

---

### Passo 6 — Configurar Mercado Livre OAuth

1. Acesse: https://developers.mercadolivre.com.br/devcenter
2. Clique em **Criar aplicação**
3. Configure:
   - Nome: `AfiliadoBot`
   - Redirect URI: `https://seudominio.com/ml/callback`
   - Scopo: `read`
4. Copie o **Client ID** e **Client Secret**
5. No EasyPanel → Variáveis de Ambiente → atualize `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_AFFILIATE_TAG`
6. Clique em **Redeploy**
7. No dashboard do AfiliadoBot: vá no workspace → Plataformas → ML → **Autorizar ML OAuth**

---

### Passo 7 — Configurar Shopee Affiliates

1. Acesse: https://affiliate.shopee.com.br → Ferramentas → API de Afiliado
2. Crie um aplicativo e copie **App ID** e **Secret Key**
3. No EasyPanel → atualize `SHOPEE_APP_ID`, `SHOPEE_SECRET`, `SHOPEE_AFFILIATE_TAG`
4. No dashboard: workspace → Plataformas → Shopee → **Configurar**
5. Preencha App ID, Secret Key e Sub ID

---

### Passo 8 — Primeiro uso

1. **Login** com a senha definida em `DASHBOARD_PASSWORD`
2. **Criar Workspace**: ex: "Tech", cor azul
3. **Conectar WhatsApp**:
   - Aba WhatsApp → Conectar WhatsApp → Escanear QR Code com o celular
4. **Cadastrar grupos**:
   - Após conectar → Listar Grupos → clique "+" nos grupos que receberão as ofertas
5. **Configurar plataformas** (ML e/ou Shopee)
6. **Buscar Ofertas**: aba Inbox → "Buscar Ofertas" ou aguarde o worker automático (30min)
7. **Aprovar** as ofertas que quiser → clique **Enviar**

---

## 🖥️ Deploy em VPS (Docker Compose)

Ideal para servidores onde você gerencia tudo manualmente via SSH.

### Pré-requisitos

- Ubuntu 20.04+ ou Debian 11+
- Docker + Docker Compose instalados
- Domínio apontando para o servidor (opcional, mas recomendado para HTTPS)

---

### Passo 1 — Instalar Docker

```bash
# Instalar Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Instalar Docker Compose
sudo apt install docker-compose-plugin -y

# Verificar instalação
docker --version
docker compose version
```

---

### Passo 2 — Clonar o repositório

```bash
git clone https://github.com/GuilhermeAzespo/affiliate-HUB.git
cd affiliate-HUB
```

---

### Passo 3 — Configurar variáveis

```bash
cp .env.example .env
nano .env
```

Preencha todos os campos. Para o `DATABASE_URL` no docker-compose, use:
```
DATABASE_URL=postgresql://afiliadobot:SUA_SENHA_DB@db:5432/afiliadobot
```

Crie também um `.env` para o docker-compose com a senha do banco:
```bash
echo "DB_PASSWORD=SUA_SENHA_DB_AQUI" >> .env
echo "DASHBOARD_PASSWORD=SuaSenhaForte123!" >> .env
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
# Adicione as demais variáveis conforme .env.example
```

---

### Passo 4 — Subir os containers

```bash
# Construir e subir em segundo plano
docker compose up -d --build

# Acompanhar logs
docker compose logs -f app

# Ver status dos containers
docker compose ps
```

---

### Passo 5 — Configurar Nginx (Proxy reverso com HTTPS)

```bash
# Instalar Nginx e Certbot
sudo apt install nginx certbot python3-certbot-nginx -y

# Criar config do Nginx
sudo nano /etc/nginx/sites-available/afiliadobot
```

Cole o conteúdo abaixo (substitua `seudominio.com`):

```nginx
server {
    listen 80;
    server_name seudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

```bash
# Ativar o site
sudo ln -s /etc/nginx/sites-available/afiliadobot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Gerar certificado SSL gratuito
sudo certbot --nginx -d seudominio.com

# Verificar renovação automática
sudo certbot renew --dry-run
```

---

### Passo 6 — Comandos úteis no VPS

```bash
# Parar tudo
docker compose down

# Atualizar após novo código
git pull
docker compose up -d --build

# Ver logs do app
docker compose logs -f app

# Ver logs do banco
docker compose logs -f db

# Acessar banco de dados
docker compose exec db psql -U afiliadobot

# Fazer backup do banco
docker compose exec db pg_dump -U afiliadobot afiliadobot > backup_$(date +%Y%m%d).sql

# Restaurar backup
cat backup_20240101.sql | docker compose exec -T db psql -U afiliadobot

# Reiniciar apenas o app (sem recriar DB)
docker compose restart app
```

---

### Passo 7 — Backup das sessões WhatsApp

As sessões do WhatsApp ficam no volume `auth_state`. Para fazer backup:

```bash
# Localizar o volume
docker volume inspect affiliate-hub_auth_state

# Copiar sessões para backup
docker run --rm -v affiliate-hub_auth_state:/data -v $(pwd):/backup ubuntu \
  tar czf /backup/auth_state_backup_$(date +%Y%m%d).tar.gz /data
```

---

## 🔄 Fluxo de Uso

```
┌─────────────────────────────────────────────────────────┐
│           WORKER (automático, a cada 30min)             │
│   ML API + Shopee API → busca ofertas → salva como     │
│   "pending" no banco por workspace + plataforma         │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              INBOX DE CURADORIA (você)                  │
│   Ver ofertas pendentes → ✅ Aprovar ou ❌ Rejeitar     │
│   Filtrar por plataforma (ML / Shopee) e status         │
└──────────────────────────┬──────────────────────────────┘
                           │ Aprovada
                           ▼
┌─────────────────────────────────────────────────────────┐
│         DISPARO (manual, sob seu controle)              │
│   Clique "📤 Enviar" → Baileys envia para grupos ativos │
│   Mensagem formatada com preço, desconto, link, #publi  │
└─────────────────────────────────────────────────────────┘
```

---

## ⚖️ Conformidade Legal

| Regra | Como o sistema cumpre |
|---|---|
| Sem post automático | Toda mensagem exige clique humano de aprovação + envio |
| Link ML oficial | Permalink com `matt_word`/`matt_tool` (sem shortener) |
| Identificação de publicidade | `#publi` em todas as mensagens (CONAR) |
| Sem disparo massivo | Envia somente para grupos cadastrados manualmente |
| Shopee: rastreio oficial | Link com `sub_id` oficial (sem encurtador) |

> ⚠️ **Atenção**: Os Termos dos programas de afiliados mudam periodicamente. Releia-os regularmente.

---

## 🛠️ Desenvolvimento Local

```bash
# Instalar Node.js 20+
# Windows: https://nodejs.org
# Linux: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install nodejs

# Clonar e configurar
git clone https://github.com/GuilhermeAzespo/affiliate-HUB.git
cd affiliate-HUB

# Configurar variáveis (aponte DATABASE_URL para um Postgres local ou Docker)
cp .env.example .env

# Instalar dependências do backend
npm install

# Gerar Prisma Client e criar tabelas
npm run prisma:generate
npm run prisma:migrate

# Iniciar backend (porta 3000)
npm run dev

# Em outro terminal — instalar e iniciar frontend
cd frontend
npm install
npm run dev   # Porta 5173 com proxy → :3000
```

Acesse: `http://localhost:5173`

---

## 📌 Troubleshooting

### WhatsApp desconecta frequentemente
- Certifique-se que o volume `auth_state` está persistido corretamente
- Evite escanear o QR com o mesmo número em múltiplos lugares

### Erro "ML não configurado"
- Verifique se executou o OAuth: workspace → Plataformas → ML → Autorizar
- Confirme que `ML_CLIENT_ID` e `ML_CLIENT_SECRET` estão corretos nas envs

### Erro "Shopee API error"
- Verifique App ID e Secret Key no painel Shopee Affiliates
- Confirme que a conta está aprovada no programa de afiliados

### Banco de dados não conecta
- Verifique se o serviço `db` está rodando: `docker compose ps`
- Confirme a `DATABASE_URL` — o hostname deve ser `db` (nome do serviço no compose)

### Frontend não carrega (404)
- Em produção, rode `npm run frontend:build` antes ou deixe o Dockerfile fazer isso
- Em desenvolvimento, certifique-se que o Vite está rodando na porta 5173

---

## 📄 Licença

MIT — Use com responsabilidade e em conformidade com os Termos de cada programa de afiliados.
