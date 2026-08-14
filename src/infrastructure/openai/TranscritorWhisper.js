// =============================================================
//  ADAPTER — transcrição de áudio (whisper-1, via SDK oficial)
//  LANÇA em falha: o chamador decide o que dizer ao cliente.
//  (O legado montava o multipart na mão com axios+form-data; o SDK
//  faz o mesmo com um único caminho de autenticação.)
// =============================================================

const OpenAI = require('openai');

function criar({ cliente }) {
    async function transcrever({ buffer, mimetype }) {
        const file = await OpenAI.toFile(buffer, 'audio.ogg', { type: mimetype || 'audio/ogg' });
        const transcription = await cliente.audio.transcriptions.create({ file, model: 'whisper-1' });
        return transcription.text;
    }
    return { transcrever };
}

module.exports = { criar };
