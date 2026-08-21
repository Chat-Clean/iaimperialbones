// =============================================================
//  SHARED — utilidades de telefone (puras)
// =============================================================

// Extrai o telefone de um identificador do WhatsApp.
// ATENÇÃO: o JID pode trazer sufixo de dispositivo e domínio, como
// "558491756446:24@s.whatsapp.net". É obrigatório cortar em ':' e '@' ANTES
// de limpar os não-dígitos — senão o "24" do id do aparelho gruda no número
// ("55849175644624") e o push cai em 404. Pior: um sufixo de 1 dígito produz
// um número com cara de válido e a mensagem vai para OUTRA pessoa.
function normalizarPhone(phone) {
    return String(phone ?? '')
        .split('@')[0]
        .split(':')[0]
        .replace(/\D/g, '');
}

// Núcleo canônico de um número BR para COMPARAÇÃO (ignora o 9º dígito de celular).
// Ex.: 5584994610845 (13) e 558494610845 (12) viram o mesmo núcleo → casam.
// Usado só na allow-list; o número original é preservado para o envio (push).
function nucleoNumero(n) {
    let d = normalizarPhone(n);
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
