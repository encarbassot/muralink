export interface MailFileAccess {
  root: string
  resolve: (rel: string) => string
  serve: (filepath: string, res: any) => void
  mimeFor: (filepath: string) => string
  attachDir: string
}
