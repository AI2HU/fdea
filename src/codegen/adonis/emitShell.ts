import type { DesignTokens } from "../../contracts/project.js";
import { file, quote, type GeneratedFile } from "../files.js";
import { crudPermission } from "../../process/access.js";
import type { EntityPlan, GenerationPlan } from "./plan.js";

export const cssFile = (tokens: DesignTokens): GeneratedFile =>
  file("inertia/css/app.css", themeCss(tokens));

export const themeCss = (tokens: DesignTokens): string =>
  `@import 'tailwindcss';

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --font-sans: var(--font-family);
}

:root {
  --radius: ${tokens.radius};
  --font-family: ${tokens.font_sans};
  --background: ${tokens.background};
  --foreground: ${tokens.foreground};
  --card: ${tokens.background};
  --card-foreground: ${tokens.foreground};
  --popover: ${tokens.background};
  --popover-foreground: ${tokens.foreground};
  --primary: ${tokens.primary};
  --primary-foreground: ${tokens.primary_foreground};
  --secondary: ${tokens.muted};
  --secondary-foreground: ${tokens.foreground};
  --muted: ${tokens.muted};
  --muted-foreground: color-mix(in oklab, ${tokens.foreground} 58%, ${tokens.background});
  --accent: ${tokens.accent};
  --accent-foreground: ${tokens.foreground};
  --destructive: ${tokens.destructive};
  --border: ${tokens.border};
  --input: ${tokens.border};
  --ring: color-mix(in oklab, ${tokens.primary} 55%, ${tokens.background});
}

@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground font-sans antialiased;
  }
}
`;

export const componentsJsonFile = (): GeneratedFile =>
  file(
    "components.json",
    JSON.stringify(
      {
        $schema: "https://shadcn-vue.com/schema.json",
        style: "new-york",
        typescript: true,
        tailwind: {
          config: "",
          css: "inertia/css/app.css",
          baseColor: "neutral",
          cssVariables: true,
          prefix: "",
        },
        aliases: {
          components: "~/components",
          utils: "~/lib/utils",
          ui: "~/components/ui",
          lib: "~/lib",
          hooks: "~/hooks",
        },
        iconLibrary: "lucide",
      },
      null,
      2,
    ),
  );

export const viteConfigFile = (): GeneratedFile =>
  file(
    "vite.config.ts",
    `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import adonisjs from '@adonisjs/vite/client'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    adonisjs({ entryPoints: ['inertia/app.ts'], reload: ['resources/views/**/*.edge'] }),
  ],

  resolve: {
    alias: {
      '~/': \`\${import.meta.dirname}/inertia/\`,
      '@generated': \`\${import.meta.dirname}/.adonisjs/client/\`,
    },
  },

  server: {
    watch: {
      ignored: ['**/storage/**', '**/tmp/**'],
    },
  },
})`,
  );

export const appEntryFile = (title: string): GeneratedFile =>
  file(
    "inertia/app.ts",
    `import './css/app.css'
import 'vue-sonner/style.css'
import { client } from './client'
import { createInertiaApp } from '@inertiajs/vue3'
import { TuyauProvider } from '@adonisjs/inertia/vue'
import { createApp, h, type DefineComponent } from 'vue'
import { resolvePageComponent } from '@adonisjs/inertia/helpers'

const appName = ${quote(title)}

createInertiaApp({
  title: (title) => (title ? \`\${title} - \${appName}\` : appName),
  resolve: (name) => {
    return resolvePageComponent(
      \`./pages/\${name}.vue\`,
      import.meta.glob<DefineComponent>('./pages/**/*.vue')
    )
  },
  setup({ el, App, props, plugin }) {
    createApp({ render: () => h(TuyauProvider, { client }, () => h(App, props)) })
      .use(plugin)
      .mount(el)
  },
  progress: {
    color: 'var(--primary)',
  },
})`,
  );

const UTILS = `import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}`;

const FORMAT = `export function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, { timeZone: 'UTC' })
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export function formatBoolean(value: boolean | null | undefined) {
  if (value === null || value === undefined) return '—'
  return value ? 'Yes' : 'No'
}

export function toDateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : ''
}

export function toDateTimeInput(value: string | null | undefined) {
  return value ? value.slice(0, 16) : ''
}`;

const BUTTON = `<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '~/lib/utils'

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
        outline: 'border bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

type ButtonVariants = VariantProps<typeof buttonVariants>

const props = withDefaults(
  defineProps<{
    variant?: NonNullable<ButtonVariants['variant']>
    size?: NonNullable<ButtonVariants['size']>
    type?: 'button' | 'submit' | 'reset'
    class?: string
  }>(),
  { type: 'button' }
)

const attrs = useAttrs()
const classes = computed(() =>
  cn(buttonVariants({ variant: props.variant, size: props.size }), props.class)
)

defineExpose({ buttonVariants })
</script>

<template>
  <button :type="type" :class="classes" v-bind="attrs">
    <slot />
  </button>
</template>
`;

const BUTTON_VARIANTS = `import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
        outline: 'border bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)
`;

const INPUT = `<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: string; type?: string }>()
const attrs = useAttrs()
const classes = computed(() =>
  cn(
    'flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
    props.class
  )
)
</script>

<template>
  <input :type="type" :class="classes" v-bind="attrs" />
</template>
`;

const TEXTAREA = `<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: string }>()
const attrs = useAttrs()
const classes = computed(() =>
  cn(
    'flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
    props.class
  )
)
</script>

<template>
  <textarea :class="classes" v-bind="attrs" />
</template>
`;

const LABEL = `<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: string }>()
const attrs = useAttrs()
const classes = computed(() => cn('text-sm leading-none font-medium', props.class))
</script>

<template>
  <label :class="classes" v-bind="attrs">
    <slot />
  </label>
</template>
`;

const SELECT = `<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cn } from '~/lib/utils'

export type Option = { id: number | string; label: string }

const props = defineProps<{ class?: string }>()
const attrs = useAttrs()
const classes = computed(() =>
  cn(
    'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive',
    props.class
  )
)
</script>

<template>
  <select :class="classes" v-bind="attrs">
    <slot />
  </select>
</template>
`;

const CARD = `<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: string }>()
const attrs = useAttrs()
const classes = computed(() =>
  cn('rounded-xl border bg-card text-card-foreground shadow-xs', props.class)
)
</script>

<template>
  <div :class="classes" v-bind="attrs">
    <slot />
  </div>
</template>
`;

const CARD_HEADER = `<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: string }>()
const attrs = useAttrs()
const classes = computed(() => cn('flex flex-col gap-1.5 p-6', props.class))
</script>

<template>
  <div :class="classes" v-bind="attrs">
    <slot />
  </div>
</template>
`;

const CARD_TITLE = `<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: string }>()
const attrs = useAttrs()
const classes = computed(() => cn('leading-none font-semibold', props.class))
</script>

<template>
  <h3 :class="classes" v-bind="attrs">
    <slot />
  </h3>
</template>
`;

const CARD_DESCRIPTION = `<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: string }>()
const attrs = useAttrs()
const classes = computed(() => cn('text-sm text-muted-foreground', props.class))
</script>

<template>
  <p :class="classes" v-bind="attrs">
    <slot />
  </p>
</template>
`;

const CARD_CONTENT = `<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: string }>()
const attrs = useAttrs()
const classes = computed(() => cn('p-6 pt-0', props.class))
</script>

<template>
  <div :class="classes" v-bind="attrs">
    <slot />
  </div>
</template>
`;

const TABLE = `<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: string }>()
const attrs = useAttrs()
const classes = computed(() => cn('w-full caption-bottom text-sm', props.class))
</script>

<template>
  <div class="relative w-full overflow-x-auto">
    <table :class="classes" v-bind="attrs">
      <slot />
    </table>
  </div>
</template>
`;

const TABLE_HEADER = `<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: string }>()
const attrs = useAttrs()
const classes = computed(() => cn('[&_tr]:border-b', props.class))
</script>

<template>
  <thead :class="classes" v-bind="attrs">
    <slot />
  </thead>
</template>
`;

const TABLE_BODY = `<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: string }>()
const attrs = useAttrs()
const classes = computed(() => cn('[&_tr:last-child]:border-0', props.class))
</script>

<template>
  <tbody :class="classes" v-bind="attrs">
    <slot />
  </tbody>
</template>
`;

const TABLE_ROW = `<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: string }>()
const attrs = useAttrs()
const classes = computed(() =>
  cn('border-b transition-colors hover:bg-muted/50', props.class)
)
</script>

<template>
  <tr :class="classes" v-bind="attrs">
    <slot />
  </tr>
</template>
`;

const TABLE_HEAD = `<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: string }>()
const attrs = useAttrs()
const classes = computed(() =>
  cn(
    'h-10 px-3 text-left align-middle font-medium whitespace-nowrap text-muted-foreground',
    props.class
  )
)
</script>

<template>
  <th :class="classes" v-bind="attrs">
    <slot />
  </th>
</template>
`;

const TABLE_CELL = `<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: string }>()
const attrs = useAttrs()
const classes = computed(() => cn('p-3 align-middle', props.class))
</script>

<template>
  <td :class="classes" v-bind="attrs">
    <slot />
  </td>
</template>
`;

const BADGE = `<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '~/lib/utils'

const badgeVariants = cva(
  'inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
      },
    },
    defaultVariants: { variant: 'secondary' },
  }
)

type BadgeVariants = VariantProps<typeof badgeVariants>

const props = defineProps<{
  variant?: NonNullable<BadgeVariants['variant']>
  class?: string
}>()
const attrs = useAttrs()
const classes = computed(() => cn(badgeVariants({ variant: props.variant }), props.class))
</script>

<template>
  <span :class="classes" v-bind="attrs">
    <slot />
  </span>
</template>
`;

const FORM_FIELD = `<script setup lang="ts">
import Label from '~/components/ui/label.vue'

defineProps<{
  name: string
  label: string
  required: boolean
  error?: string
}>()
</script>

<template>
  <div class="grid gap-2">
    <Label :for="name">
      {{ label }}
      <span v-if="required" class="text-destructive"> *</span>
    </Label>
    <slot />
    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
  </div>
</template>
`;

const PAGE_HEADER = `<script setup lang="ts">
import { Head } from '@inertiajs/vue3'

defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <Head :title="title" />
  <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div class="grid gap-1">
      <h1 class="text-2xl font-semibold tracking-tight">{{ title }}</h1>
      <p v-if="description" class="text-sm text-muted-foreground">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
`;

const FLASH_TOASTS = `<script setup lang="ts">
import { watch } from 'vue'
import { usePage } from '@inertiajs/vue3'
import { toast, Toaster } from 'vue-sonner'

const page = usePage()

watch(
  () => page.url,
  () => toast.dismiss()
)

watch(
  () => page.props.flash,
  (flash) => {
    if (flash?.error) toast.error(flash.error, { id: 'flash' })
    if (flash?.success) toast.success(flash.success, { id: 'flash' })
  },
  { immediate: true, deep: true }
)
</script>

<template>
  <Toaster position="top-center" rich-colors />
</template>
`;

const AUTH_LAYOUT = `<script setup lang="ts">
import Card from '~/components/ui/card.vue'
import CardContent from '~/components/ui/card_content.vue'
import FlashToasts from '~/components/flash_toasts.vue'
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-muted/40 p-4">
    <Card class="w-full max-w-sm">
      <CardContent class="grid gap-6 pt-6">
        <slot />
      </CardContent>
    </Card>
    <FlashToasts />
  </div>
</template>
`;

const loginPage = (title: string): string => `<script setup lang="ts">
import AuthLayout from '~/layouts/auth.vue'
import { Form } from '@adonisjs/inertia/vue'
import Button from '~/components/ui/button.vue'
import FormField from '~/components/form_field.vue'
import Input from '~/components/ui/input.vue'
</script>

<template>
  <AuthLayout>
    <div class="grid gap-1">
      <h1 class="text-xl font-semibold tracking-tight">${title.replaceAll("`", "\\`")}</h1>
      <p class="text-sm text-muted-foreground">Sign in to continue.</p>
    </div>

    <Form v-slot="{ errors, processing }" route="session.store" class="grid gap-4">
      <FormField name="email" label="Email" :required="true" :error="errors.email">
        <Input
          id="email"
          name="email"
          type="email"
          autocomplete="username"
          :aria-invalid="errors.email ? true : undefined"
        />
      </FormField>
      <FormField name="password" label="Password" :required="true" :error="errors.password">
        <Input
          id="password"
          name="password"
          type="password"
          autocomplete="current-password"
          :aria-invalid="errors.password ? true : undefined"
        />
      </FormField>
      <Button type="submit" :disabled="processing">Sign in</Button>
    </Form>
  </AuthLayout>
</template>
`;

const errorPage = (
  heading: string,
  text: string,
): string => `<script setup lang="ts">
import { Head, Link } from '@inertiajs/vue3'
import { buttonVariants } from '~/components/ui/button_variants'
import { cn } from '~/lib/utils'
</script>

<template>
  <Head title="${heading}" />
  <div class="flex min-h-screen flex-col items-center justify-center gap-4 p-4 text-center">
    <h1 class="text-2xl font-semibold tracking-tight">${heading}</h1>
    <p class="text-sm text-muted-foreground">${text}</p>
    <Link href="/" :class="cn(buttonVariants({ variant: 'outline' }))">Back to the app</Link>
  </div>
</template>
`;

export const useCanFile = (rbac: boolean): GeneratedFile =>
  file(
    "inertia/hooks/use_can.ts",
    rbac
      ? `import { usePage } from '@inertiajs/vue3'

export function useCan() {
  const page = usePage()
  return (permission: string) =>
    (page.props.permissions as string[] | undefined)?.includes(permission) ?? false
}`
      : `export function useCan() {
  return (_permission: string) => true
}`,
  );

const navTarget = (
  entity: EntityPlan,
): { route: string; permission: string } | undefined => {
  if (entity.crud.has("list")) {
    return {
      route: `${entity.names.routeName}.index`,
      permission: crudPermission(entity.entity.id, "list"),
    };
  }
  if (entity.crud.has("create")) {
    return {
      route: `${entity.names.routeName}.create`,
      permission: crudPermission(entity.entity.id, "create"),
    };
  }
  return undefined;
};

export const navItems = (
  plan: GenerationPlan,
): Array<{ label: string; route: string; permission: string }> =>
  plan.entities.flatMap((entity) => {
    const target = navTarget(entity);
    return target === undefined
      ? []
      : [{ label: entity.names.pluralLabel, ...target }];
  });

const layoutFile = (title: string, plan: GenerationPlan): string => {
  const items = navItems(plan);
  return `<script setup lang="ts">
import { computed } from 'vue'
import { Form, Link } from '@adonisjs/inertia/vue'
import { usePage } from '@inertiajs/vue3'
import { LogOut } from 'lucide-vue-next'
import { urlFor } from '~/client'
import Button from '~/components/ui/button.vue'
import FlashToasts from '~/components/flash_toasts.vue'
import { useCan } from '~/hooks/use_can'
import { cn } from '~/lib/utils'

const nav = ${JSON.stringify(items, null, 2)} as const

const page = usePage()
const can = useCan()
const visible = computed(() => nav.filter((item) => can(item.permission)))
</script>

<template>
  <div class="min-h-screen bg-background">
    <header class="border-b">
      <div class="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link route="dashboard" class="font-semibold tracking-tight">
          ${title.replaceAll("`", "\\`")}
        </Link>
        <nav class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          <Link
            v-for="item in visible"
            :key="item.route"
            :route="item.route"
            :class="
              cn(
                'rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors hover:bg-accent',
                page.url.split('?')[0].startsWith(urlFor(item.route))
                  ? 'bg-accent font-medium'
                  : 'text-muted-foreground'
              )
            "
          >
            {{ item.label }}
          </Link>
        </nav>
        <div class="flex items-center gap-3">
          <span class="hidden text-sm text-muted-foreground sm:inline">
            {{ page.props.user?.fullName ?? page.props.user?.email }}
          </span>
          <Form route="session.destroy">
            <Button type="submit" variant="outline" size="sm">
              <LogOut /> Log out
            </Button>
          </Form>
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-6xl px-4 py-8">
      <slot />
    </main>
    <FlashToasts />
  </div>
</template>
`;
};

const dashboardFile = (
  title: string,
  summary: string,
  plan: GenerationPlan,
): string => {
  const items = navItems(plan);
  return `<script setup lang="ts">
import { computed } from 'vue'
import { Link } from '@adonisjs/inertia/vue'
import AppLayout from '~/layouts/app.vue'
import PageHeader from '~/components/page_header.vue'
import { useCan } from '~/hooks/use_can'

const areas = ${JSON.stringify(items, null, 2)} as const
const can = useCan()
const visible = computed(() => areas.filter((area) => can(area.permission)))
</script>

<template>
  <AppLayout>
    <PageHeader
      title=${quote(title)}
      description=${quote(summary)}
    />
    <p class="mb-6 text-sm text-muted-foreground">
      Process screens are agent-built. Implement the Inertia pages listed in
      <code class="rounded bg-muted px-1 py-0.5">UI.md</code>, then replace this
      dashboard freely.
    </p>
    <ul class="grid gap-2">
      <li v-for="area in visible" :key="area.route">
        <Link
          :route="area.route"
          class="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {{ area.label }}
        </Link>
      </li>
    </ul>
  </AppLayout>
</template>
`;
};

/** Framework-agnostic Vue primitives; `root` is the directory `~/` resolves to. */
export const vuePrimitiveFiles = (root: string): GeneratedFile[] => [
  file(`${root}/lib/utils.ts`, UTILS),
  file(`${root}/lib/format.ts`, FORMAT),
  file(`${root}/components/ui/button.vue`, BUTTON),
  file(`${root}/components/ui/button_variants.ts`, BUTTON_VARIANTS),
  file(`${root}/components/ui/input.vue`, INPUT),
  file(`${root}/components/ui/textarea.vue`, TEXTAREA),
  file(`${root}/components/ui/label.vue`, LABEL),
  file(`${root}/components/ui/select.vue`, SELECT),
  file(`${root}/components/ui/card.vue`, CARD),
  file(`${root}/components/ui/card_header.vue`, CARD_HEADER),
  file(`${root}/components/ui/card_title.vue`, CARD_TITLE),
  file(`${root}/components/ui/card_description.vue`, CARD_DESCRIPTION),
  file(`${root}/components/ui/card_content.vue`, CARD_CONTENT),
  file(`${root}/components/ui/table.vue`, TABLE),
  file(`${root}/components/ui/table_header.vue`, TABLE_HEADER),
  file(`${root}/components/ui/table_body.vue`, TABLE_BODY),
  file(`${root}/components/ui/table_row.vue`, TABLE_ROW),
  file(`${root}/components/ui/table_head.vue`, TABLE_HEAD),
  file(`${root}/components/ui/table_cell.vue`, TABLE_CELL),
  file(`${root}/components/ui/badge.vue`, BADGE),
  file(`${root}/components/form_field.vue`, FORM_FIELD),
];

export const shellFiles = (
  title: string,
  summary: string,
  plan: GenerationPlan,
  rbac: boolean,
): GeneratedFile[] => [
  ...vuePrimitiveFiles("inertia"),
  file("inertia/components/page_header.vue", PAGE_HEADER),
  file("inertia/components/flash_toasts.vue", FLASH_TOASTS),
  file("inertia/layouts/auth.vue", AUTH_LAYOUT),
  file("inertia/layouts/app.vue", layoutFile(title, plan)),
  file("inertia/pages/auth/login.vue", loginPage(title)),
  file("inertia/pages/dashboard.vue", dashboardFile(title, summary, plan)),
  file(
    "inertia/pages/errors/not_found.vue",
    errorPage("Page not found", "The page you are looking for does not exist."),
  ),
  file(
    "inertia/pages/errors/server_error.vue",
    errorPage(
      "Something went wrong",
      "The server could not complete the request.",
    ),
  ),
  useCanFile(rbac),
];
