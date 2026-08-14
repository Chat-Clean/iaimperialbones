// =============================================================
//  SHARED — utilidades de data/hora
// =============================================================

function obterDataHoraBrasilia() {
    const agora = new Date();
    const brasiliaOffset = -3 * 60;
    const utcTime = agora.getTime() + (agora.getTimezoneOffset() * 60000);
    return new Date(utcTime + (brasiliaOffset * 60000));
}

module.exports = { obterDataHoraBrasilia };
