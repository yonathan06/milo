import { createServerOnlyFn } from '@tanstack/react-start'

export const getBraveApiKey = createServerOnlyFn(() => process.env.BRAVE_API_KEY)
