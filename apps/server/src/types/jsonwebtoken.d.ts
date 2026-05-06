declare module 'jsonwebtoken' {
  const jwt: any

  namespace jwt {
    export type Algorithm = string
  }

  export type Algorithm = jwt.Algorithm
  export default jwt
}
