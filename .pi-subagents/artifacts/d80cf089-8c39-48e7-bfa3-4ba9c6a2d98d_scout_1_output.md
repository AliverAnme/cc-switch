# Frontend Analysis: cc-switch (v3.16.5)

> Analysis date: 2026-07-13
> Project: cc-switch — All-in-One Assistant for Claude Code, Codex & Gemini CLI
> Author: Jason Young

---

## 1. Resumen General de la Arquitectura Frontend

cc-switch es una aplicación Tauri v2 (escritorio) cuyo frontend React/TypeScript gestiona múltiples clientes AI CLI (Claude Code, Claude Desktop, Codex, Gemini, OpenCode, OpenClaw, Hermes) como un **selector universal de proveedores e integrador de configuración**.

La UI se organiza como una **SPA de página única** con un sistema de vistas controlado por estado local (`useState<View>`). La vista principal ("providers") renderiza una lista de proveedores para la app activa, con capacidad de arrastrar y soltar para reordenar. Otras vistas incluyen settings, skills, MCP, prompts, sesiones, workspace, y paneles específicos de OpenClaw/Hermes.

**Arquitectura general:**

```
main.tsx (bootstrap)
  └── QueryClientProvider (TanStack React Query)
       └── ThemeProvider (modo claro/oscuro/sistema)
            └── UpdateProvider (check de actualizaciones)
                 └── App.tsx (router state, layout, header)
                      ├── ProviderList (vista principal)
                      ├── SettingsPage / SkillsPage / UnifiedMcpPanel / etc.
                      └── Diálogos modales: Add/EditProviderDialog, ConfirmDialog, etc.
```

Cada vista se monta/desmonta con `AnimatePresence` (framer-motion). La comunicación con el backend Rust (Tauri) se realiza mediante `invoke()` y eventos Tauri, con una capa de abstracción en `src/lib/api/`.

---

## 2. Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Framework | React | 18.2.x |
| Lenguaje | TypeScript | 5.3+ (strict mode) |
| Build | Vite | 7.3.x |
| Desktop | Tauri v2 (API, dialog, store, process, updater) | 2.8.x |
| UI primitives | shadcn/ui (Radix-based) | via components.json |
| Estilos | Tailwind CSS | 3.4.x |
| Animaciones | framer-motion | 12.x |
| Estado servidor | TanStack React Query | 5.x |
| Formularios | react-hook-form + zod | 7.x / 4.x |
| Drag & drop | @dnd-kit | 6.x / 3.x |
| Iconos | lucide-react + @lobehub/icons-static-svg | |
| Internacionalización | i18next + react-i18next | 25.x / 16.x |
| Notificaciones | sonner | 2.x |
| Testing | Vitest + Testing Library + MSW | |
| Editores de código | CodeMirror 6 (JSON, Markdown, JS) | |
| Gráficos | recharts | 3.x |
| Búsqueda | flexsearch | 0.8.x |

**UI primitives instaladas (shadcn/ui):** accordion, alert, badge, button, card, checkbox, collapsible, command (cmdk), dialog, dropdown-menu, form, input, label, popover, scroll-area, select, sonner, switch, table, tabs, textarea, tooltip.

---

## 3. Sistema de Componentes y Diseño

### 3.1 Estructura de Componentes

```
src/components/
├── ui/              → 23 componentes shadcn/ui (button, dialog, etc.)
├── providers/       → ProviderList, ProviderCard, formularios por app
│   ├── forms/       → ProviderForm + formularios específicos (Claude, Codex, Gemini, OpenCode, OpenClaw, Hermes)
│   └── shared/      → Componentes de formulario compartidos
├── settings/        → 22 paneles de configuración (About, Theme, WebDAV, S3, Proxy, etc.)
├── skills/          → UnifiedSkillsPanel, SkillsPage, SkillCard, RepoManager
├── mcp/             → UnifiedMcpPanel, McpFormModal, McpWizardModal
├── profiles/        → ProfileSwitcher
├── sessions/        → SessionManagerPage, SessionItem
├── prompts/         → PromptPanel, PromptFormModal
├── agents/          → AgentsPanel
├── universal/       → UniversalProviderPanel, UniversalProviderCard, UniversalProviderFormModal
├── openclaw/        → EnvPanel, ToolsPanel, AgentsDefaultsPanel, OpenClawHealthBanner
├── hermes/          → HermesMemoryPanel
├── workspace/       → WorkspaceFilesPanel, WorkspaceFileEditor, DailyMemoryPanel
├── proxy/           → ProxyToggle, FailoverToggle, FailoverQueueManager, AutoFailoverConfigPanel
├── deeplink/        → DeepLinkImportDialog + confirmaciones (MCP, Prompt, Skill)
├── env/             → EnvWarningBanner
├── common/          → Componentes compartidos (si existen)
├── AppSwitcher.tsx  → Selector de apps (Claude, Codex, Gemini, etc.)
├── BrandIcons.tsx   → Iconos de marca
├── ProviderIcon.tsx → Mapeo icono → componente
└── ...
```

### 3.2 Patrón de Diseño

- **shadcn/ui** como base de componentes atómicos (Button, Dialog, Select, etc.) con variantes vía `class-variance-authority`.
- **Tailwind CSS** con variables CSS para theming (modo claro/oscuro vía clase `.dark` en `<html>`).
- **framer-motion** para transiciones entre vistas y animaciones de entrada/salida.
- Layout responsivo mínimo (app de escritorio con tamaño fijo).
- Uso extensivo de `cn()` (tailwind-merge + clsx) para composición de clases.
- Paleta de colores personalizada (blues, grays, greens, reds, ambers) extendida en tailwind.config.

### 3.3 Providers UI por App

Cada app (Claude, Codex, Gemini, OpenCode, OpenClaw, Hermes) tiene su propio formulario de edición en `src/components/providers/forms/`:
- `ClaudeFormFields.tsx`, `CodexFormFields.tsx`, `GeminiFormFields.tsx`, `OpenCodeFormFields.tsx`, `OpenClawFormFields.tsx`, `HermesFormFields.tsx`
- Además: `ClaudeDesktopProviderForm.tsx` (para Claude Desktop, que usa modo direct/proxy).
- El formulario genérico `ProviderForm.tsx` se adapta según el tipo de app.

---

## 4. Sistema de Configuración

### 4.1 Presets de Proveedores

Cada app tiene su archivo de presets en `src/config/`:

| Archivo | Líneas | Contenido |
|---------|--------|-----------|
| `claudeProviderPresets.ts` | 1,383 | ~50+ presets para Claude (Anthropic oficial, third-party, agregadores) |
| `codexProviderPresets.ts` | 1,529 | ~60+ presets para Codex (OpenAI, third-party) |
| `geminiProviderPresets.ts` | 479 | Presets para Gemini |
| `openclawProviderPresets.ts` | 2,506 | Presets OpenClaw con modelos, costos, catálogo |
| `opencodeProviderPresets.ts` | 2,051 | Presets OpenCode con configuraciones de SDK AI |
| `claudeDesktopProviderPresets.ts` | 1,142 | Presets Claude Desktop (modo direct/proxy) |
| `hermesProviderPresets.ts` | 1,524 | Presets Hermes Agent |
| `universalProviderPresets.ts` | 132 | Presets de proveedores unificados (NewAPI, etc.) |

Cada preset define: nombre, URL, configuración (settingsConfig), categoría, icono, endpoints candidatos, formato API, y metadatos.

### 4.2 Archivos de Configuración Adicionales

| Archivo | Propósito |
|---------|-----------|
| `constants.ts` | Constantes de tipos de provider y templates de usage script |
| `codexTemplates.ts` | Templates de configuración para Codex |
| `codingPlanProviders.ts` | Integración con "Coding Plan" providers (Kimi, Zhipu, MiniMax) |
| `mcpPresets.ts` | Presets de servidores MCP conocidos |
| `userAgentPresets.ts` | User-Agent presets para local proxy |
| `iconInference.ts` | Inferencia de iconos basada en URL/nombre |
| `appConfig.tsx` | Mapeo AppId → label, icono, clases de estilo |

### 4.3 Tipos

`src/types.ts` (744 líneas) define los tipos principales:
- `Provider`, `ProviderCategory`, `ProviderMeta` — modelo de datos de proveedores
- `AppConfig`, `Settings` — configuración de app y settings del dispositivo
- `UsageScript`, `UsageData`, `UsageResult` — sistema de consulta de uso
- `McpServer`, `McpApps`, `McpStatus` — gestión MCP
- `UniversalProvider`, `UniversalProviderModels` — proveedores unificados
- `OpenCodeModel`, `OpenCodeProviderConfig` — tipos OpenCode
- `OpenClawModel`, `OpenClawProviderConfig`, `OpenClawHealthWarning` — tipos OpenClaw
- `HermesModelConfig`, `HermesMemoryLimits` — tipos Hermes
- `SessionMeta`, `SessionMessage` — sesiones
- `Settings` — settings del dispositivo con ~50+ campos

`src/types/` contiene tipos especializados:
- `env.ts` — EnvConflict, BackupInfo
- `icon.ts` — tipos de iconos
- `omo.ts` — tipos Oh My OpenCode
- `proxy.ts` — tipos de proxy
- `subscription.ts` — tipos de suscripción
- `usage.ts` — tipos adicionales de usage

---

## 5. Manejo de Estado y Flujo de Datos

### 5.1 Estado Global

| Mecanismo | Uso |
|-----------|-----|
| TanStack React Query | Estado del servidor: providers, settings, skills, MCP, sesiones, proxy status, failover, OMO |
| React Context | ThemeProvider (tema claro/oscuro), UpdateProvider (actualizaciones) |
| Estado local (useState) | Vista activa, app activa, diálogos, formularios |

### 5.2 Data Flow

```
[Backend Rust (Tauri)]
    ↓ invoke() / eventos Tauri
[API Layer] src/lib/api/
    ├── providers.ts    → CRUD proveedores, switch, import, tray menu
    ├── settings.ts     → CRUD settings, import/export, webdav, s3
    ├── mcp.ts          → CRUD servidores MCP
    ├── skills.ts       → CRUD skills
    ├── proxy.ts        → proxy status, targets
    ├── sessions.ts     → CRUD sesiones
    ├── profiles.ts     → perfiles de config
    ├── prompts.ts      → prompts
    ├── openclaw.ts     → OpenClaw API
    ├── hermes.ts       → Hermes API
    ├── usage.ts        → consulta de uso
    ├── deeplink.ts     → deep link
    └── auth.ts / copilot.ts → OAuth Copilot
    ↓
[Query Layer] src/lib/query/
    ├── queryClient.ts       → QueryClient config
    ├── queries.ts           → useProvidersQuery, useSettingsQuery, useUsageQuery
    ├── mutations.ts         → Mutaciones CRUD
    ├── proxy.ts             → Queries de proxy
    ├── failover.ts          → Failover queue queries
    ├── subscription.ts      → Subscription queries
    └── omo.ts               → OMO queries
    ↓
[Hooks] src/hooks/
    ├── useProviderActions.ts → Lógica de negocio CRUD
    ├── useProxyStatus.ts     → Estado del proxy
    ├── useOpenClaw.ts        → OpenClaw health, live provider IDs
    ├── useHermes.ts          → Hermes live provider IDs, WebUI
    ├── useDragSort.ts        → Drag and drop sort
    ├── useAutoCompact.ts     → Toolbar compactado automático
    └── ... (26 hooks total)
    ↓
[Components] → Renderizado UI
```

### 5.3 Patrón Clave: Vistas basadas en `useState<View>`

`App.tsx` mantiene un estado `currentView: View` (14 vistas posibles: `"providers" | "settings" | "prompts" | "skills" | "skillsDiscovery" | "mcp" | "agents" | "universal" | "sessions" | "workspace" | "openclawEnv" | "openclawTools" | "openclawAgents" | "hermesMemory"`).

Cada vista se renderiza con `switch-case` dentro de `renderContent()`, envuelta en `AnimatePresence` para transiciones. No hay React Router — es una SPA de una sola página con enrutamiento manual.

### 5.4 Persistencia

- **Settings** → `~/.cc-switch/settings.json` (archivo local, no sync)
- **Providers/Config** → Base de datos Tauri (SQLite via Rust backend)
- **Sync** → WebDAV v2 y S3 opcionales
- **Preferencias UI** → localStorage (última app, última vista, idioma, tema)

---

## 6. Internacionalización

- **Motor:** i18next + react-i18next
- **Idiomas:** zh (chino simplificado, default), en, ja, zh-TW
- **Archivos:** ~2,987 líneas cada uno, con estructura idéntica de claves
- **Detección:** localStorage → navigator.language → fallback zh
- **Key count estimado:** ~1,000+ claves de traducción

---

## 7. Utilidades (src/utils/)

| Archivo | Propósito |
|---------|-----------|
| `errorUtils.ts` | `extractErrorMessage()`, `translateMcpBackendError()` |
| `formatters.ts` | `formatJSON()`, `parseSmartMcpJson()` (formateo JSON/MCP) |
| `providerConfigUtils.ts` | Análisis de configuración de proveedores (API format detection, Codex wire API) |
| `providerConfigUtils.test.ts` | Tests unitarios (único test de utils) |
| `providerMetaUtils.ts` | Manipulación de metadatos de proveedores |
| `deepClone.ts` | Clonado profundo |
| `domUtils.ts` | `isTextEditableTarget()` y utilidades DOM |
| `usageDisplay.ts` | Formateo de datos de uso para display |
| `tomlUtils.ts` | Parseo de TOML (envuelve smol-toml) |
| `textNormalization.ts` | Normalización de texto |
| `uuid.ts` | Generación de UUIDs |
| `postChangeSync.ts` | Sync después de cambios de configuración |

---

## 8. Tamaño y Complejidad Estimados

| Métrica | Valor |
|---------|-------|
| Archivos TypeScript/TSX totales | 314 |
| Líneas de código frontend | ~79,891 |
| Componentes UI (shadcn) | 23 |
| Pantallas/Vistas principales | 14 |
| Hooks personalizados | 26 |
| Archivos API (backend bridge) | 23 |
| Archivos de configuración/presets | 15 (~11,210 líneas) |
| Archivos de tipos | 7 (~920 líneas) |
| Pruebas unitarias | 2 archivos (providerConfigUtils, version) |
| Archivos de locales | 4 (~11,920 líneas total) |
| Dependencias runtime | ~35+ |
| Versión | 3.16.5 |

---

## 9. Áreas de Mejora y Riesgo

### 🟡 Riesgos Moderados

1. **App.tsx monolítico (1,665 líneas)** — Todo el enrutamiento, layout, header, y lógica de eventos están en un solo componente. Separar en rutas, layout component, y custom hooks reduciría complejidad.

2. **Baja cobertura de tests** — Solo 2 archivos de test (`providerConfigUtils.test.ts`, `version.test.ts`) para ~79,891 líneas. Sin tests de componentes, hooks, o integración. Riesgo alto de regresiones.

3. **Estado de vistas manual** — El sistema de vistas es un `switch-case` gigante en `renderContent()`. Sin React Router, las vistas no tienen URLs, no soportan navegación con historial, y toda la lógica de permisos/cambios de vista está en el componente App.

4. **Presets monolíticos** — Los archivos de presets (especialmente `openclawProviderPresets.ts` con 2,506 líneas) son arrays enormes de objetos. Serían más mantenibles como datos estructurados (JSON/YAML cargados) o divididos por categoría.

5. **OpenClaw y Hermes como apps especiales** — Tienen paneles adicionales (env, tools, agents, memory) y flujos específicos (addToLive, removeFromLiveConfig, default model) que añaden complejidad sustancial al ProviderList genérico y los hooks.

6. **TypeScript strict mode con zonas de escape** — Aunque el tsconfig tiene `strict: true`, hay uso extensivo de `any`, `Record<string, any>`, y `as any` para tipos de estilo CSS y props Tauri.

### 🟢 Áreas Bien Resueltas

1. **Separación API/Hooks/Componentes** — La capa de API (`src/lib/api/`) está limpiamente separada de los hooks de negocio y los componentes de UI.

2. **TanStack React Query bien utilizado** — Caché, refetch automático, loading/error states, mutations con invalidación.

3. **Internacionalización consistente** — Todos los textos visibles pasan por `t()` con valores por defecto.

4. **Manejo de errores robusto** — `extractErrorMessage()` normaliza errores de distintas fuentes (Rust, Tauri, JS), con traducción de errores MCP.

5. **Tipos bien definidos** — El archivo `types.ts` define interfaces completas con JSDoc en chino e inglés.

6. **shadcn/ui actualizado** — Componentes base modernos, accesibles, con variantes consistentes.

---

## 10. Archivos Clave para un Nuevo Desarrollador

| Archivo | Por qué empezar aquí |
|---------|---------------------|
| `src/App.tsx` | Punto de entrada principal: enrutamiento, layout, gestión de estado global |
| `src/main.tsx` | Bootstrap: providers, theme, error handling de init |
| `src/types.ts` | Modelo de datos completo |
| `src/lib/api/providers.ts` | API bridge al backend Rust para proveedores |
| `src/lib/query/queries.ts` | Queries de React Query (providers, settings, usage) |
| `src/hooks/useProviderActions.ts` | Lógica de negocio CRUD de proveedores |
| `src/config/claudeProviderPresets.ts` | Ejemplo de sistema de presets |
| `src/components/providers/ProviderList.tsx` | Componente principal de lista con drag & drop |
| `src/components/providers/ProviderCard.tsx` | Card individual de proveedor |
| `src/i18n/index.ts` | Configuración de internacionalización |

---

## 11. Hallazgos de la Revisión

### review-findings

| Severidad | Archivo | Línea | Hallazgo |
|-----------|---------|-------|----------|
| warning | src/App.tsx | 1-1665 | Componente monolítico; mezcla layout, routing, lógica de eventos, y coordinación de diálogos |
| warning | src/config/openclawProviderPresets.ts | 1-2506 | Preset file sobredimensionado; datos en código en lugar de estructurados |
| info | src/config/claudeProviderPresets.ts | 1-1383 | Misma observación que openclaw — datos masivos inline |
| warning | src/hooks/useProviderActions.ts | 1-412 | Hook con múltiples responsabilidades (add, update, delete, switch, duplicate, etc.) |
| info | src/App.tsx | ~300-400 | Múltiples `useEffect` para eventos Tauri; difícil de razonar orden/limpieza |
| info | src/components/providers/ProviderList.tsx | 1-655 | Lógica de failover, OMO, búsqueda, drag & drop, health checks todo en una lista |
| info | src/components/ui/button.tsx | 12-46 | Variante `mcp` hardcodeada específica del dominio en un componente UI genérico |
| warning | — | — | Solo 2 tests unitarios (providerConfigUtils, version) sin tests de componentes |
| info | src/types.ts | ~400-744 | `Settings` con ~50+ campos planos — podría beneficiarse de agrupación |

### residual-risks

1. **Regresión por falta de tests** — Cambios en App.tsx o ProviderList.tsx (los más grandes) pueden romper flujos sin detección temprana.
2. **Crecimiento de presets** — Los arrays de presets inline en archivos TS crecen sin control; al acercarse a 3,000 líneas son difíciles de revisar.
3. **Acoplamiento Tauri** — Toda la capa API depende de `invoke("@tauri-apps/api/core")`; probar componentes fuera de Tauri requiere mocks pesados.
4. **Vista "universal" desconectada** — El panel de proveedores unificados (`UniversalProviderPanel`) usa su propio flujo de datos separado de `providersApi`, lo que puede causar inconsistencias.

---

## 12. Acceptance Report

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Análisis completo de 79,891 líneas TS/TSX, 314 archivos, 14 vistas, 26 hooks, 23 componentes UI shadcn, 15 archivos de configuración/presets, y 4 locales de i18n. Todos los hallazgos tienen rutas de archivo exactas y severidad."
    }
  ],
  "changedFiles": [],
  "testsAddedOrUpdated": [],
  "commandsRun": [
    {
      "command": "wc -l, find, grep sobre src/",
      "result": "passed",
      "summary": "Conteo de líneas, archivos y estructura de directorios completado"
    },
    {
      "command": "Lectura de 25+ archivos clave",
      "result": "passed",
      "summary": "Cobertura de lectura en App.tsx, main.tsx, types.ts, config/, hooks/, lib/, components/ y utils/"
    }
  ],
  "validationOutput": [
    "79,891 líneas totales de frontend TypeScript/TSX",
    "314 archivos de código fuente",
    "2 tests unitarios existentes",
    "4 idiomas soportados (zh, en, ja, zh-TW)"
  ],
  "residualRisks": [
    "App.tsx monolítico (1,665 líneas) — riesgo de regresión en cambios",
    "Solo 2 tests unitarios en todo el frontend",
    "Presets inline en TypeScript (hasta 2,506 líneas) sin estructura de datos externa",
    "Acoplamiento fuerte a Tauri invoke() para testing"
  ],
  "noStagedFiles": true,
  "diffSummary": "No se modificaron archivos — solo análisis exploratorio",
  "reviewFindings": [
    "warning: App.tsx monolítico (1,665 líneas) — mezcla routing, layout y lógica de eventos",
    "warning: openclawProviderPresets.ts (2,506 líneas) y claudeProviderPresets.ts (1,383 líneas) sobredimensionados",
    "info: ProviderList.tsx (655 líneas) con múltiples responsabilidades",
    "info: Solo 2 tests unitarios en ~79,891 líneas de frontend",
    "info: Variante 'mcp' hardcodeada en button.tsx (componente UI genérico)",
    "info: Settings con ~50+ campos planos en types.ts"
  ],
  "manualNotes": "Análisis completo del frontend cc-switch v3.16.5. Stack: React 18 + TypeScript 5.3 + Tauri v2 + shadcn/ui + TanStack Query + Tailwind + i18next. El proyecto tiene buena arquitectura general con API/hooks/componentes separados, pero App.tsx y los archivos de presets son áreas con alta densidad de código que merecen refactorización. La cobertura de tests es muy baja."
}
```
