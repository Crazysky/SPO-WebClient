---
name: animation-micro-interaction-pack
description: Provides reusable interaction patterns and motion presets that make UI feel polished. Includes hover effects, transitions, entrance animations, gesture feedback, and reduced-motion support. Use when adding "animations", "transitions", "micro-interactions", or "motion design".
---

# Animation & Micro-interaction Pack

Create polished, performant animations and micro-interactions.

## Animation Patterns

**Hover Effects**: Scale, lift (translateY), glow (box-shadow), color shifts
**Entrance**: Fade-in, slide-in, zoom-in with stagger for lists
**Exit**: Fade-out, slide-out, scale-out
**Loading**: Pulse, skeleton waves, progress bars
**Gestures**: Ripple on click, drag feedback, swipe indicators

## CSS Animations

```css
/* Custom animations */
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes ripple { to { transform: scale(4); opacity: 0; } }

.animate-fadeIn { animation: fadeIn 0.5s ease-out; }
.animate-slideUp { animation: slideUp 0.3s ease-out; }
.animate-scaleIn { animation: scaleIn 0.2s ease-out; }
```

## Best Practices

- Use 200-300ms for micro-interactions
- Respect prefers-reduced-motion
- Animate transform/opacity for performance (GPU-accelerated)
- Add easing functions (avoid linear)
- Stagger list items for entrance animations
- Provide hover/active/focus states for all interactive elements
- Use will-change sparingly
