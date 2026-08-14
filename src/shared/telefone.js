// =============================================================
//  SHARED — utilidades de telefone (puras)
// =============================================================

function normalizarPhone(phone) {
    return String(phone).replace(/\D/g, '');
}

// Núcleo canônico de um número BR para COMPARAÇÃO (ignora o 9º dígito de celular).
// Ex.: 5584994610845 (13) e 558494610845 (12) viram o mesmo núcleo → casam.
// Usado só na allow-list; o número original é preservado para o envio (push).
function nucleoNumero(n) {
    let d = String(n).replace(/\D/g, '');
    if (d.length === 13 && d.startsWith('55') && d[4] === '9') {
        d = d.slice(0, 4) + d.slice(5); // remove o 9 logo após o DDD
    }
    return d;
}

// true se o número está na allow-list (tolerante ao 9º dígito). Lista vazia = libera todos.
function contatoPermitido(numero, lista) {
    if (!lista || !lista.length) return true;
    const alvo = nucleoNumero(numero);
    return lista.some(a => nucleoNumero(a) === alvo);
}

module.exports = { normalizarPhone, nucleoNumero, contatoPermitido };
