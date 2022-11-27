export const JsonSerializer = {
  serialize: (data: any) => JSON.stringify(data),
  unserialize: (data: any) => JSON.parse(data),
}
