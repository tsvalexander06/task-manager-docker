async function transcribeVoice(buffer, filename = "voice.ogg") {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const form = new FormData();
  form.append("file", new Blob([buffer]), filename);
  form.append("model", "whisper-1");
  form.append("language", "bg");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });
  if (!res.ok) {
    throw new Error(`Whisper error: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.text;
}

module.exports = { transcribeVoice };
