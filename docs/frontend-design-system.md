# Frontend Design System

Based on the premium, futuristic visual reference for Web3 + AI infrastructure.

## 1. Core Philosophy
- **Aesthetic**: Premium, futuristic, dark mode, glassmorphism, glowing.
- **Mood**: Trustworthy, technologically advanced, intelligent.
- **Structure**: Modular, highly legible data presentation, floating elements.

## 2. Color Palette
- **Backgrounds**:
  - `bg-app`: Deep space black/blue (`#040914`, `#070B19`)
  - `bg-surface`: Translucent glass (`rgba(255, 255, 255, 0.02)`)
  - `bg-surface-hover`: Translucent glass hover (`rgba(255, 255, 255, 0.05)`)
- **Accents (Glowing / Gradients)**:
  - `accent-primary`: Neon Blue / Cyan (`#00F0FF`, `#3B82F6`)
  - `accent-secondary`: Deep Purple / Magenta (`#8B5CF6`, `#D946EF`)
- **Typography Colors**:
  - `text-primary`: Pure White (`#FFFFFF`)
  - `text-secondary`: Muted Blue-Gray (`#94A3B8`)
  - `text-tertiary`: Dark Gray (`#475569`)
- **Status Colors**:
  - `status-success`: Emerald Green (`#10B981`)
  - `status-warning`: Amber (`#F59E0B`)
  - `status-error`: Rose Red (`#EF4444`)

## 3. Typography
- **Primary Font**: `Outfit`, `Inter`, or `Plus Jakarta Sans` (Google Fonts).
- **Headings**: Semi-bold to Bold, tight tracking.
- **Body**: Regular to Medium, highly readable.
- **Monospace**: `JetBrains Mono` or `Fira Code` for wallet addresses and code snippets.

## 4. UI Components & Patterns

### Cards (Glassmorphism)
- **Background**: `rgba(255, 255, 255, 0.02)`
- **Border**: `1px solid rgba(255, 255, 255, 0.05)`
- **Border-Top**: Glowing accent line (e.g., `1px solid rgba(0, 240, 255, 0.3)`)
- **Backdrop Filter**: `blur(16px)`
- **Shadow**: Subtle underglow `0 8px 32px rgba(0, 0, 0, 0.5)`

### Buttons
- **Primary Button**:
  - Background: Gradient from Primary to Secondary Accent.
  - Text: White, Semi-bold.
  - Border: None.
  - Hover: Brightness increase, slight scale up.
- **Secondary / Outline Button**:
  - Background: Transparent.
  - Border: `1px solid rgba(255, 255, 255, 0.1)`.
  - Hover: `rgba(255, 255, 255, 0.05)` background.

### Inputs & Forms
- **Background**: Darker than surface (`rgba(0, 0, 0, 0.2)`).
- **Border**: `1px solid rgba(255, 255, 255, 0.1)`.
- **Focus**: Border turns to `accent-primary` with a subtle outer glow (`box-shadow: 0 0 8px rgba(0, 240, 255, 0.4)`).

### Badges / Pills
- Small, rounded indicators for status, categories, or AI confidence scores.
- Background: 10-20% opacity of the accent color.
- Text: 100% opacity of the accent color.

### Navigation
- Floating top or side navigation bar.
- Highly blurred glassmorphism background.
- Active states indicated by a subtle glow or accent underline.

### Tables & Data Lists
- Clean rows with bottom borders (`1px solid rgba(255, 255, 255, 0.05)`).
- Hover effects on rows (slight background lightness).
- Alignment: Numbers right-aligned, text left-aligned.

### Animations
- **Micro-interactions**: Smooth transitions (0.2s - 0.3s ease-in-out) on hover for buttons, cards, and links.
- **Loading States**: Shimmer effects or glowing pulse animations instead of generic spinners.
- **Page Transitions**: Soft fade-in and slide-up.

## 5. Visual Hierarchy & Spacing
- High whitespace/padding inside cards to feel uncluttered and premium.
- Distinct separation between standard data (deterministic metrics) and AI-generated insights (which might feature a special glow or icon to denote "AI Analysis").
