
import isDev from './isDev'

export const domain = isDev
    ? `http://localhost:5173`
    : 'app://example.com/'

export const getURL = (pathname: string) => new URL(pathname, domain).toString()
