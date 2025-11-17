# WION POS Admin Dashboard

## Environment Configuration

This application supports different environments with configurable gateway URLs.

### Environment Variables

The application uses the following environment variables:

- `VITE_GATEWAY_URL`: The gateway URL for API calls
- `VITE_API_TIMEOUT`: API timeout in milliseconds

### Available Scripts

#### Development
```bash
# Local development (default: http://localhost:11001)
npm run dev
# or
npm run dev:local
```

#### Building for different environments
```bash
# Development build
npm run build

# Staging build
npm run build:staging

# Production build
npm run build:production
```

#### Preview builds
```bash
# Preview development build
npm run preview

# Preview staging build
npm run preview:staging

# Preview production build
npm run preview:production
```

### Environment Files

Create the following environment files in your project root:

#### `.env.development` (for development)
```
VITE_GATEWAY_URL=http://localhost:11001
VITE_API_TIMEOUT=10000
```

#### `.env.staging` (for staging)
```
VITE_GATEWAY_URL=https://staging-api.wionpos.com
VITE_API_TIMEOUT=30000
```

#### `.env.production` (for production)
```
VITE_GATEWAY_URL=https://api.wionpos.com
VITE_API_TIMEOUT=30000
```

### How it works

1. **Environment Detection**: The app automatically detects the current environment based on the build mode
2. **Gateway URL**: The API calls will use the appropriate gateway URL for each environment
3. **Fallback**: If no environment file is found, it uses default values:
   - Development: `http://localhost:11001`
   - Staging: `https://staging-api.wionpos.com`
   - Production: `https://api.wionpos.com`

### OAuth 2.0 PKCE Flow

The application uses OAuth 2.0 PKCE (Proof Key for Code Exchange) flow:

1. **Frontend** → `GET {gateway}/auth/connect?redirect_uri={frontend_domain}/dashboard`
2. **Backend** → Generates PKCE (code_verifier, code_challenge, state)
3. **Backend** → Redirects to authorization server
4. **User** → Logs in on authorization server
5. **Authorization Server** → Redirects to `{frontend_domain}/dashboard?code=xxx&state=xxx`
6. **Frontend** → Calls `GET {gateway}/auth/callback?state=xxx&code=xxx&redirect_uri=xxx`
7. **Backend** → Exchanges code for access_token and refresh_token
8. **Frontend** → Stores tokens and navigates to dashboard

### API Endpoints

The application calls these endpoints on the gateway:

- `GET {gateway}/auth/connect` - Initiate OAuth flow
- `GET {gateway}/auth/callback` - Handle callback and exchange code for token
- `POST {gateway}/auth/logout` - Logout

### Usage Example

When you click the "Login with WiAccount" button, it will:

1. **Development**: 
   - Call `http://localhost:11001/auth/connect?redirect_uri=http://localhost:5176/dashboard`
   - Redirect to authorization server
   - Return to `http://localhost:5176/dashboard?code=xxx&state=xxx`

2. **Production**: 
   - Call `https://api.wionpos.com/auth/connect?redirect_uri=https://admin.wionpos.com/dashboard`
   - Redirect to authorization server  
   - Return to `https://admin.wionpos.com/dashboard?code=xxx&state=xxx`

### Frontend Domain Configuration

The `redirect_uri` is automatically set to the current frontend domain:
- **Development**: `http://localhost:5176/dashboard`
- **Production**: `https://admin.wionpos.com/dashboard`
- **Staging**: `https://staging-admin.wionpos.com/dashboard`

# WION POS Portal Docker Build Guide

## Prerequisites

- Docker installed
- Node.js installed
- Access to cri-o.tpos.dev registry

## Build Steps

1. Set execute permission for build script:
```bash
chmod +x docker-build.sh
```

2. Login to container registry:
```bash
docker login cri-o.tpos.dev
```

3. Build images:

For staging environment:
```bash
./docker-build.sh staging
```

For production environment:
```bash
./docker-build.sh production
```

4. Push images:

For staging:
```bash
docker push cri-o.tpos.dev/wionpos/stagging/admin:latest
docker push cri-o.tpos.dev/wionpos/stagging/admin:<version>
```

For production:
```bash
docker push cri-o.tpos.dev/wionpos-production/production-v2/admin:latest
docker push cri-o.tpos.dev/wionpos-production/production-v2/admin:<version>
```

## Local Testing

Test staging build:
```bash
docker run -p 8080:80 cri-o.tpos.dev/wionpos/stagging/admin:latest
```

Test production build:
```bash
docker run -p 8080:80 cri-o.tpos.dev/wionpos-production/production-v2/admin:latest
```

Then visit http://localhost:8080 in your browser.