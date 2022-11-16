export const Serializers = {
  json: "json",
  avro: "avro",
} as const

export type Serializers = typeof Serializers[keyof typeof Serializers]

export default Serializers
