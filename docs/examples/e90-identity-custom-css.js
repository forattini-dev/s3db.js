/**
 * Example 90: Identity Plugin - Custom CSS Injection
 *
 * Demonstra como injetar CSS customizado para transformar completamente
 * a aparência do Identity Provider usando apenas CSS.
 *
 * Casos de uso:
 * - Aplicar branding da empresa sem reescrever HTML
 * - Temas customizados (dark mode, glassmorphism, etc.)
 * - Animações e efeitos visuais
 * - Responsividade customizada
 *
 * Usage:
 *   node docs/examples/e90-identity-custom-css.js
 */

import { Database } from '../../src/index.js';
import { IdentityPlugin } from '../../src/plugins/identity/index.js';

const db = new Database({
  connectionString: process.env.MRT_CONNECTION_STRING || 'http://minioadmin:minioadmin@localhost:9100/identity-css-demo'
});

async function main() {
  await db.initialize();

  // ============================================================================
  // Exemplo 1: Glassmorphism Theme (Estilo moderno com blur)
  // ============================================================================

  const glassmorphismCSS = `
    /* Glassmorphism Theme */

    /* Fundo com gradiente animado */
    body {
      background: linear-gradient(-45deg, #667eea, #764ba2, #f093fb, #4facfe);
      background-size: 400% 400%;
      animation: gradient 15s ease infinite;
    }

    @keyframes gradient {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }

    /* Cards com efeito glass */
    .identity-login__form,
    .identity-login__panel,
    .card {
      background: rgba(255, 255, 255, 0.1) !important;
      backdrop-filter: blur(10px) saturate(180%);
      -webkit-backdrop-filter: blur(10px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.3) !important;
      box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37) !important;
    }

    /* Inputs com glass */
    input[type="text"],
    input[type="email"],
    input[type="password"] {
      background: rgba(255, 255, 255, 0.2) !important;
      backdrop-filter: blur(5px);
      border: 1px solid rgba(255, 255, 255, 0.3) !important;
      color: #fff !important;
    }

    input::placeholder {
      color: rgba(255, 255, 255, 0.7) !important;
    }

    /* Botões com efeito hover suave */
    button, .btn {
      background: linear-gradient(135deg, rgba(102, 126, 234, 0.8), rgba(118, 75, 162, 0.8)) !important;
      border: none !important;
      box-shadow: 0 4px 15px 0 rgba(102, 126, 234, 0.4);
      transition: all 0.3s ease;
    }

    button:hover, .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px 0 rgba(102, 126, 234, 0.6);
    }
  `;

  // ============================================================================
  // Exemplo 2: Dark Cyberpunk Theme
  // ============================================================================

  const cyberpunkCSS = `
    /* Cyberpunk Dark Theme */

    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap');

    body {
      background: #0a0e27;
      font-family: 'Orbitron', sans-serif !important;
    }

    /* Neon glow effect */
    h1, h2, .brand {
      color: #00ffff !important;
      text-shadow:
        0 0 10px #00ffff,
        0 0 20px #00ffff,
        0 0 30px #00ffff;
      animation: neonPulse 2s ease-in-out infinite alternate;
    }

    @keyframes neonPulse {
      from { text-shadow: 0 0 10px #00ffff, 0 0 20px #00ffff; }
      to { text-shadow: 0 0 20px #00ffff, 0 0 30px #00ffff, 0 0 40px #00ffff; }
    }

    /* Cards com bordas neon */
    .card, .identity-login__form {
      background: rgba(10, 14, 39, 0.9) !important;
      border: 2px solid #ff00ff !important;
      box-shadow:
        0 0 10px #ff00ff,
        inset 0 0 10px rgba(255, 0, 255, 0.2) !important;
    }

    /* Inputs cyberpunk */
    input {
      background: rgba(0, 255, 255, 0.05) !important;
      border: 1px solid #00ffff !important;
      color: #00ffff !important;
      box-shadow: inset 0 0 5px rgba(0, 255, 255, 0.2);
    }

    input:focus {
      box-shadow:
        inset 0 0 5px rgba(0, 255, 255, 0.4),
        0 0 10px #00ffff !important;
    }

    /* Botões neon */
    button {
      background: linear-gradient(45deg, #ff00ff, #00ffff) !important;
      border: none !important;
      color: #0a0e27 !important;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 2px;
      box-shadow: 0 0 20px rgba(255, 0, 255, 0.5);
      position: relative;
      overflow: hidden;
    }

    button::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
      transition: left 0.5s;
    }

    button:hover::before {
      left: 100%;
    }

    /* Grid background */
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image:
        linear-gradient(rgba(0, 255, 255, 0.1) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px);
      background-size: 50px 50px;
      pointer-events: none;
      z-index: -1;
    }
  `;

  // ============================================================================
  // Exemplo 3: Minimalist Professional (Estilo corporativo limpo)
  // ============================================================================

  const minimalistCSS = `
    /* Minimalist Professional Theme */

    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap');

    body {
      background: #FAFBFC;
      font-family: 'Inter', sans-serif !important;
    }

    /* Cards com sombra sutil */
    .card, .identity-login__form {
      background: #FFFFFF !important;
      border: 1px solid #E1E4E8 !important;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04) !important;
      border-radius: 8px !important;
      transition: box-shadow 0.2s ease;
    }

    .card:hover {
      box-shadow: 0 4px 12px rgba(0,0,0,0.08) !important;
    }

    /* Tipografia clean */
    h1, h2, h3 {
      font-weight: 600 !important;
      color: #24292E !important;
      letter-spacing: -0.02em;
    }

    /* Inputs minimalistas */
    input {
      background: #FFFFFF !important;
      border: 1px solid #D1D5DA !important;
      border-radius: 6px !important;
      color: #24292E !important;
      font-size: 14px;
      transition: border-color 0.2s ease;
    }

    input:focus {
      border-color: #0366D6 !important;
      box-shadow: 0 0 0 3px rgba(3, 102, 214, 0.1) !important;
    }

    /* Botões flat com hover suave */
    button {
      background: #0366D6 !important;
      border: none !important;
      border-radius: 6px !important;
      color: #FFFFFF !important;
      font-weight: 500;
      font-size: 14px;
      padding: 10px 16px;
      transition: background 0.2s ease;
    }

    button:hover {
      background: #0256C5 !important;
    }

    /* Links discretos */
    a {
      color: #0366D6 !important;
      text-decoration: none;
      transition: color 0.2s ease;
    }

    a:hover {
      color: #0256C5 !important;
      text-decoration: underline;
    }

    /* Sem animações desnecessárias */
    * {
      animation: none !important;
    }
  `;

  // ============================================================================
  // Exemplo 4: Gradient Modern (Estilo atual, tipo Stripe/Vercel)
  // ============================================================================

  const gradientModernCSS = `
    /* Gradient Modern Theme */

    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&display=swap');

    body {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-family: 'Sora', sans-serif !important;
      position: relative;
    }

    /* Mesh gradient background */
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background:
        radial-gradient(at 27% 37%, hsla(215, 98%, 61%, 0.3) 0px, transparent 50%),
        radial-gradient(at 97% 21%, hsla(125, 98%, 72%, 0.3) 0px, transparent 50%),
        radial-gradient(at 52% 99%, hsla(354, 98%, 61%, 0.3) 0px, transparent 50%),
        radial-gradient(at 10% 29%, hsla(256, 96%, 67%, 0.3) 0px, transparent 50%);
      filter: blur(100px);
      pointer-events: none;
      z-index: -1;
    }

    /* Cards modernos */
    .card, .identity-login__form {
      background: rgba(255, 255, 255, 0.95) !important;
      border: none !important;
      border-radius: 24px !important;
      box-shadow:
        0 20px 25px -5px rgba(0, 0, 0, 0.1),
        0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
      padding: 40px !important;
    }

    /* Títulos com gradiente */
    h1, h2 {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      font-weight: 700 !important;
    }

    /* Inputs modernos */
    input {
      background: #F9FAFB !important;
      border: 2px solid #E5E7EB !important;
      border-radius: 12px !important;
      color: #111827 !important;
      font-size: 15px;
      padding: 14px 16px !important;
      transition: all 0.2s ease;
    }

    input:focus {
      background: #FFFFFF !important;
      border-color: #667eea !important;
      box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1) !important;
      transform: translateY(-1px);
    }

    /* Botões com gradiente e hover effect */
    button {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      border: none !important;
      border-radius: 12px !important;
      color: #FFFFFF !important;
      font-weight: 600;
      font-size: 15px;
      padding: 14px 24px !important;
      box-shadow: 0 4px 6px -1px rgba(102, 126, 234, 0.3);
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }

    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 15px -3px rgba(102, 126, 234, 0.4);
    }

    button:active {
      transform: translateY(0);
    }

    /* Floating labels animation */
    .identity-login__group {
      position: relative;
    }

    .identity-login__group label {
      position: absolute;
      top: 14px;
      left: 16px;
      transition: all 0.2s ease;
      pointer-events: none;
      color: #6B7280;
    }

    .identity-login__group input:focus + label,
    .identity-login__group input:not(:placeholder-shown) + label {
      top: -8px;
      left: 12px;
      font-size: 12px;
      background: #FFFFFF;
      padding: 0 4px;
      color: #667eea;
      font-weight: 600;
    }
  `;

  // ============================================================================
  // Escolha um tema para rodar
  // ============================================================================

  const selectedTheme = process.env.THEME || 'gradient'; // glassmorphism, cyberpunk, minimalist, gradient

  const themes = {
    glassmorphism: glassmorphismCSS,
    cyberpunk: cyberpunkCSS,
    minimalist: minimalistCSS,
    gradient: gradientModernCSS
  };

  const identityPlugin = new IdentityPlugin({
    issuer: 'http://localhost:4000',
    database: db,

    ui: {
      title: 'Custom CSS Demo',
      companyName: 'S3DB',

      // Inject o CSS customizado escolhido
      customCSS: themes[selectedTheme]
    },

    server: {
      port: 4000,
      verbose: true
    }
  });

  await identityPlugin.initialize();

  console.log('\n🎨 Identity Provider - Custom CSS Demo');
  console.log('━'.repeat(60));
  console.log('');
  console.log(`🌐  Server:        http://localhost:4000`);
  console.log(`🔐  Login:         http://localhost:4000/login`);
  console.log('');
  console.log(`🎨  Theme:         ${selectedTheme}`);
  console.log('');
  console.log('💡 Mudar tema:');
  console.log('   THEME=glassmorphism node docs/examples/e90-identity-custom-css.js');
  console.log('   THEME=cyberpunk node docs/examples/e90-identity-custom-css.js');
  console.log('   THEME=minimalist node docs/examples/e90-identity-custom-css.js');
  console.log('   THEME=gradient node docs/examples/e90-identity-custom-css.js');
  console.log('');
  console.log('━'.repeat(60));
  console.log('\nPress Ctrl+C to stop\n');
}

main().catch(console.error);
