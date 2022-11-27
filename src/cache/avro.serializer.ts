import avro from "avsc";

export const CacheAvroSchema = avro.Type.forSchema({
  name: "Cache",
  type: "record",
  fields: [{ name: "data", type: ["string"] }],
});

export const AvroSerializer = {
  serialize: (data: any) => String(CacheAvroSchema.toBuffer(data)),
  unserialize: (data: any) => CacheAvroSchema.fromBuffer(Buffer.from(data)),
}
