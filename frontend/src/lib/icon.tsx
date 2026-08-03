import * as Icons from 'lucide-react';
import { HelpCircle, type LucideProps } from 'lucide-react';

// The mockup this app was ported from referenced Lucide icons by kebab-case
// name (e.g. "shield-check") and resolved them at runtime. lucide-react
// exports PascalCase components instead, so we convert on the fly. A couple
// of icon names don't follow the naive kebab->Pascal rule (digits inside a
// word, e.g. "grid-2x2" -> "Grid2X2"); those get a manual alias.
const ALIASES: Record<string, string> = {
  'grid-2x2': 'Grid2X2',
};

function toPascal(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function Icon({ name, size = 16, style, ...rest }: { name: string } & LucideProps) {
  const key = ALIASES[name] || toPascal(name);
  const Cmp = (Icons as unknown as Record<string, React.ComponentType<LucideProps>>)[key] || HelpCircle;
  return <Cmp size={size} style={{ flexShrink: 0, ...style }} {...rest} />;
}
