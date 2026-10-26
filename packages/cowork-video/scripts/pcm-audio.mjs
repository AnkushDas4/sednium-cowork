/** Small dependency-free PCM helpers, shared by assembly and regression tests. */
export function readPcm16Wav(buffer) {
  if (
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  )
    throw new Error("Expected a RIFF/WAVE file");
  let format;
  let data;
  for (let offset = 12; offset + 8 <= buffer.length; ) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ")
      format = {
        codec: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bits: buffer.readUInt16LE(start + 14),
      };
    if (id === "data")
      data = buffer.subarray(start, Math.min(start + size, buffer.length));
    offset = start + size + (size % 2);
  }
  if (
    !format ||
    format.codec !== 1 ||
    ![1, 2].includes(format.channels) ||
    format.bits !== 16 ||
    !data
  )
    throw new Error("Expected mono/stereo 16-bit PCM, not compressed audio");
  const samples = new Float32Array(data.length / 2);
  for (let i = 0; i < samples.length; i++)
    samples[i] = data.readInt16LE(i * 2) / 32768;
  return { ...format, samples };
}
export function writePcm16Wav(samples, sampleRate = 48000, channels = 1) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * channels * 2, 28);
  b.writeUInt16LE(channels * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i]) || Math.abs(samples[i]) > 1)
      throw new Error(`Invalid/clipped sample at ${i}`);
    b.writeInt16LE(
      Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32768))),
      44 + i * 2,
    );
  }
  return b;
}
export function placeTake(master, take, startSample, edgeFadeSamples = 240) {
  if (
    !Number.isInteger(startSample) ||
    startSample < 0 ||
    startSample + take.length > master.length
  )
    throw new Error(
      "Take would overrun master: extend the scene, never speed or trim speech",
    );
  const fade = Math.min(edgeFadeSamples, Math.floor(take.length / 2));
  for (let i = 0; i < take.length; i++) {
    const edge = Math.min(i, take.length - 1 - i);
    const gain =
      fade > 1 && edge < fade
        ? 0.5 - 0.5 * Math.cos((Math.PI * edge) / (fade - 1))
        : 1;
    master[startSample + i] += take[i] * gain;
  }
}
