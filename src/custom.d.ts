export {}

declare global{
  namespace Express {
    export interface Request {
      client: {
        authorized: boolean
        getCertificate: () => {
          issuer: {
            O: string
          }
        },
        getPeerCertificate: () => {
          issuer: {
            O: string
          }
        }
      }
    }
  }
}
