# Identity Plugin - White-Label Configuration

O **Identity Plugin** é 100% **white-label**, permitindo que você personalize completamente a aparência, branding e comportamento do servidor de identidade para sua empresa ou cliente.

## 🎨 Capacidades de Customização

### 1. Branding Completo

```javascript
ui: {
  // Identidade Visual
  title: 'Sua Empresa Identity',
  companyName: 'Sua Empresa',
  tagline: 'Seu slogan aqui',

  // Logos e Ícones
  logoUrl: 'https://suaempresa.com/logo.svg',
  favicon: 'https://suaempresa.com/favicon.ico',

  // Rodapé
  footerText: 'Texto customizado do rodapé',
  supportEmail: 'suporte@suaempresa.com',
  privacyUrl: '/privacidade',
  termsUrl: '/termos'
}
```

### 2. Paleta de Cores Completa

Todas as cores são customizáveis via CSS variables:

```javascript
ui: {
  // Cores Principais
  primaryColor: '#0066CC',      // Botões, links, headers
  secondaryColor: '#6c757d',    // Elementos secundários

  // Cores de Status
  successColor: '#28a745',      // Mensagens de sucesso
  dangerColor: '#dc3545',       // Erros e alertas
  warningColor: '#ffc107',      // Avisos
  infoColor: '#17a2b8',         // Informações

  // Cores de Texto
  textColor: '#212529',         // Texto principal
  textMuted: '#6c757d',         // Texto secundário

  // Cores de Fundo
  backgroundColor: '#ffffff',    // Fundo principal
  backgroundLight: '#f8f9fa',   // Fundo de cards/seções
  borderColor: '#dee2e6'        // Bordas
}
```

### 3. Tipografia Personalizada

```javascript
ui: {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: '16px'
}
```

**Fontes Google:**
```javascript
ui: {
  customCSS: `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  `
}
```

### 4. CSS Customizado (Poder Total!)

Você pode injetar **qualquer CSS** personalizado:

```javascript
ui: {
  customCSS: `
    /* Seu CSS aqui */

    /* Botões customizados */
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      transition: transform 0.2s;
    }

    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
    }

    /* Cards com efeito glassmorphism */
    .card {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    /* Animações personalizadas */
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .login-form {
      animation: fadeInUp 0.6s ease-out;
    }

    /* Temas escuros */
    @media (prefers-color-scheme: dark) {
      :root {
        --color-bg: #1a1a2e;
        --color-text: #eee;
      }
    }
  `
}
```

### 5. Layout e Design

```javascript
ui: {
  borderRadius: '0.5rem',       // Cantos arredondados
  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'  // Sombras
}
```

### 6. Links Sociais

```javascript
ui: {
  socialLinks: {
    github: 'https://github.com/suaempresa',
    twitter: 'https://twitter.com/suaempresa',
    linkedin: 'https://linkedin.com/company/suaempresa',
    facebook: 'https://facebook.com/suaempresa',
    instagram: 'https://instagram.com/suaempresa'
  }
}
```

## 📐 Arquitetura CSS

### CSS Variables (`:root`)

O BaseLayout injeta todas as configurações como CSS variables:

```css
:root {
  --color-primary: #0066CC;
  --color-secondary: #6c757d;
  --color-success: #28a745;
  --color-danger: #dc3545;
  --color-warning: #ffc107;
  --color-info: #17a2b8;

  --color-text: #212529;
  --color-text-muted: #6c757d;

  --color-bg: #ffffff;
  --color-light: #f8f9fa;
  --color-border: #dee2e6;

  --font-family: 'Inter', sans-serif;
  --font-size-base: 16px;

  --border-radius: 0.375rem;
  --box-shadow: 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075);
}
```

### Tailwind 4 CDN

Todas as páginas usam **Tailwind 4 via CDN** (`@tailwindcss/browser@4`):

```html
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
```

**Configuração Tailwind:**
```javascript
window.tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        surface: 'var(--color-card-bg)'
      },
      fontFamily: {
        display: ['var(--font-family)'],
        body: ['var(--font-family)']
      }
    }
  }
};
```

### Ordem de Carregamento CSS

1. **CSS Variables** (`:root`) - Configurações do plugin
2. **main.css** - Estilos base do Identity Plugin
3. **customCSS** - Seu CSS customizado (sobrescreve tudo)

```html
<style>:root { /* variables */ }</style>
<style>/* main.css */</style>
<style>/* customCSS aqui */</style>
```

## 🎯 Casos de Uso

### Empresa B2B SaaS

```javascript
ui: {
  title: 'Acme Corp SSO',
  companyName: 'Acme Corp',
  primaryColor: '#FF6B6B',
  fontFamily: "'Poppins', sans-serif",
  logoUrl: 'https://acme.com/logo.svg',
  customCSS: `
    .login-form {
      border-left: 4px solid #FF6B6B;
    }
  `
}
```

### Fintech

```javascript
ui: {
  title: 'SecureBank Identity',
  companyName: 'SecureBank',
  primaryColor: '#2ECC71',
  secondaryColor: '#34495E',
  fontFamily: "'Roboto', sans-serif",
  customCSS: `
    /* Tema bancário profissional */
    body {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }

    .card {
      border-top: 5px solid #2ECC71;
    }
  `
}
```

### E-commerce

```javascript
ui: {
  title: 'ShopHub Account',
  companyName: 'ShopHub',
  primaryColor: '#E91E63',
  successColor: '#4CAF50',
  fontFamily: "'Montserrat', sans-serif",
  customCSS: `
    /* Tema vibrante de e-commerce */
    .btn-primary {
      background: linear-gradient(45deg, #E91E63, #F06292);
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 1px;
    }

    .header {
      background: #000;
      color: #fff;
    }
  `
}
```

### Healthcare/Medicina

```javascript
ui: {
  title: 'MedSecure Patient Portal',
  companyName: 'MedSecure',
  primaryColor: '#0288D1',
  successColor: '#00BCD4',
  dangerColor: '#E53935',
  fontFamily: "'Open Sans', sans-serif",
  customCSS: `
    /* Tema clean e profissional para saúde */
    body {
      background: #FAFAFA;
    }

    .card {
      border-radius: 8px;
      border: 1px solid #E0E0E0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }

    .btn-primary {
      border-radius: 4px;
      font-weight: 600;
    }
  `
}
```

## 🚀 Exemplo Completo

Veja o exemplo completo em:
```
docs/examples/e85-identity-whitelabel.js
```

Execute:
```bash
node docs/examples/e85-identity-whitelabel.js
```

## 📝 Notas Importantes

### ✅ O que você PODE fazer:

- ✅ Mudar todas as cores
- ✅ Usar qualquer fonte (Google Fonts, Adobe Fonts, etc.)
- ✅ Injetar qualquer CSS personalizado
- ✅ Customizar logos e favicons
- ✅ Adicionar animações CSS
- ✅ Implementar dark mode
- ✅ Usar frameworks CSS via CDN (desde que não conflitem com Tailwind)
- ✅ Sobrescrever qualquer estilo do Identity Plugin

### ⚠️ Limitações:

- ⚠️ Não é possível mudar a estrutura HTML das páginas (apenas CSS)
- ⚠️ Tailwind 4 CDN é obrigatório (mas você pode usar outras libraries via customCSS)
- ⚠️ Logos devem ser servidos via URL (não suporta base64 inline por performance)

### 💡 Dicas:

1. **Use CSS Variables**: Elas são reativas e funcionam com Tailwind
2. **Teste Responsividade**: Sempre teste em mobile/tablet/desktop
3. **Performance**: Evite importar muitas fontes (máximo 2-3 pesos)
4. **Dark Mode**: Use `@media (prefers-color-scheme: dark)` no customCSS
5. **Acessibilidade**: Mantenha contraste adequado (WCAG AA: 4.5:1)

## 🎨 Ferramentas Úteis

- **Coolors**: https://coolors.co/ (paletas de cores)
- **Google Fonts**: https://fonts.google.com/
- **CSS Gradient**: https://cssgradient.io/
- **Shadow Generator**: https://shadows.brumm.af/
- **Color Contrast Checker**: https://webaim.org/resources/contrastchecker/

## 📚 Referências

- `src/plugins/identity/ui/layouts/base.js` - Implementação do BaseLayout
- `src/plugins/identity/ui/styles/main.css` - Estilos base
- `docs/examples/e85-identity-whitelabel.js` - Exemplo completo
- Tailwind 4 Docs: https://tailwindcss.com/docs
