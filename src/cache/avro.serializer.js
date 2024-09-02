import avro from "avsc";

export const CacheAvroSchema = avro.Type.forSchema({
  name: "Cache",
  type: "record",
  fields: [{ name: "data", type: ["string"] }],
});

export const AvroSerializer = {
  serialize: (data) => String(CacheAvroSchema.toBuffer(data)),
  unserialize: (data) => CacheAvroSchema.fromBuffer(Buffer.from(data)),
}
