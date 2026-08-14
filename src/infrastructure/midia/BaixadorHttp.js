// =============================================================
//  ADAPTER — download de mídia por HTTP (axios)
// =============================================================

const axios = require('axios');

function criar() {
    async function baixar(url, timeoutMs = 30000) {
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: timeoutMs });
        return Buffer.from(resp.data);
    }
    return { baixar };
}

module.exports = { criar };
