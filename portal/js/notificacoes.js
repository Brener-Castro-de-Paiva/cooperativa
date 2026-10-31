
/* ============================================================
   COJURIS — SISTEMA DE NOTIFICAÇÕES INTERNAS

   ARQUIVO: portal/js/notificacoes.js

   FUNCIONALIDADES PRESERVADAS:
   - Autenticação pelo Firebase Authentication
   - Controle de acesso por perfil
   - Sino integrado ao cabeçalho
   - Contador individual de comunicados não lidos
   - Atualização em tempo real
   - Histórico individual de leitura
   - Navegação para os comunicados
   - Encerramento de consultas ao trocar de sessão

   MELHORIAS:
   - Estrutura visual organizada
   - Dropdown elegante e responsivo
   - Posicionamento correto da janela
   - Mensagens claras e profissionais
   - Separação completa entre JavaScript e CSS
   - Tratamento de falhas nas consultas

   SEGURANÇA:
   Os registros são protegidos pelas regras
   do Firestore. Esconder elementos no navegador
   não substitui a autorização no banco.
   ============================================================ */


// ============================================================
// 01 — IMPORTAÇÕES DO FIREBASE
// ============================================================

import {
    auth,
    db
} from "./firebase-config.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
    collection,
    doc,
    getDoc,
    onSnapshot,
    query,
    orderBy,
    limit,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";


// ============================================================
// 02 — CONFIGURAÇÕES
//
// A consulta limita-se aos 20 comunicados mais
// recentes. O contador representa esse conjunto,
// não necessariamente todo o histórico.
// ============================================================

const LIMITE_COMUNICADOS = 20;

const DESTINO_COMUNICADOS =
    "./comunidade.html#comunicados";


// ============================================================
// 03 — ESTADO INTERNO
// ============================================================

let usuarioAtual = null;

let comunicados = [];

let idsLidos = new Set();

let cancelarComunicados = null;

let cancelarLeituras = null;

let versaoSessao = 0;

let comunicadosCarregados = false;

let leiturasCarregadas = false;

let erroComunicados = false;

let erroLeituras = false;


// ============================================================
// 04 — CRIAÇÃO SEGURA DOS ELEMENTOS
//
// O texto obtido do Firestore será inserido por
// textContent, sem interpretação como HTML.
// ============================================================

function criarElemento(
    tag,
    classe = "",
    texto = undefined
) {

    const elemento = document.createElement(tag);

    if (classe) {
        elemento.className = classe;
    }

    if (texto !== undefined) {
        elemento.textContent = String(texto);
    }

    return elemento;
}


// ============================================================
// 05 — CONSTRUÇÃO DO COMPONENTE
// ============================================================

const componente = criarElemento(
    "div",
    "cojuris-notificacoes"
);

componente.hidden = true;

componente.setAttribute(
    "aria-label",
    "Notificações da COJURIS"
);


// ------------------------------------------------------------
// 05.1 — BOTÃO DO SINO
// ------------------------------------------------------------

const sino = criarElemento(
    "button",
    "cojuris-sino"
);

sino.type = "button";

sino.title = "Notificações";

sino.setAttribute(
    "aria-label",
    "Abrir notificações"
);

sino.setAttribute(
    "aria-expanded",
    "false"
);


// Ícone institucional, sem dependência de fontes
// externas ou imagens adicionais.

const iconeSino = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg"
);

iconeSino.setAttribute(
    "viewBox",
    "0 0 24 24"
);

iconeSino.setAttribute(
    "width",
    "21"
);

iconeSino.setAttribute(
    "height",
    "21"
);

iconeSino.setAttribute(
    "fill",
    "none"
);

iconeSino.setAttribute(
    "stroke",
    "currentColor"
);

iconeSino.setAttribute(
    "stroke-width",
    "1.8"
);

iconeSino.setAttribute(
    "stroke-linecap",
    "round"
);

iconeSino.setAttribute(
    "stroke-linejoin",
    "round"
);

iconeSino.setAttribute(
    "aria-hidden",
    "true"
);

const caminhoSino = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path"
);

caminhoSino.setAttribute(
    "d",
    "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"
);

const baseSino = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "path"
);

baseSino.setAttribute(
    "d",
    "M10 21h4"
);

iconeSino.append(
    caminhoSino,
    baseSino
);


// ------------------------------------------------------------
// 05.2 — CONTADOR
// ------------------------------------------------------------

const contador = criarElemento(
    "span",
    "cojuris-contador",
    "0"
);

contador.hidden = true;

contador.setAttribute(
    "aria-hidden",
    "true"
);

sino.append(
    iconeSino,
    contador
);


// ------------------------------------------------------------
// 05.3 — PAINEL SUSPENSO
// ------------------------------------------------------------

const painel = criarElemento(
    "section",
    "cojuris-notificacoes-painel"
);

painel.hidden = true;

painel.id = "cojuris-painel-notificacoes";

painel.setAttribute(
    "aria-label",
    "Lista de notificações"
);

sino.setAttribute(
    "aria-controls",
    painel.id
);


// ------------------------------------------------------------
// 05.4 — CABEÇALHO DO PAINEL
// ------------------------------------------------------------

const cabecalho = criarElemento(
    "div",
    "cojuris-notificacoes-cabecalho"
);

const tituloPainel = criarElemento(
    "h2",
    "",
    "Notificações"
);

const fechar = criarElemento(
    "button",
    "cojuris-notificacoes-fechar",
    "×"
);

fechar.type = "button";

fechar.title = "Fechar notificações";

fechar.setAttribute(
    "aria-label",
    "Fechar notificações"
);

cabecalho.append(
    tituloPainel,
    fechar
);


// ------------------------------------------------------------
// 05.5 — MENSAGEM DE STATUS
// ------------------------------------------------------------

const mensagem = criarElemento(
    "p",
    "cojuris-notificacoes-mensagem",
    "Consultando seus comunicados..."
);

mensagem.setAttribute(
    "role",
    "status"
);

mensagem.setAttribute(
    "aria-live",
    "polite"
);


// ------------------------------------------------------------
// 05.6 — LISTAGEM
// ------------------------------------------------------------

const lista = criarElemento(
    "div",
    "cojuris-notificacoes-lista"
);


// ------------------------------------------------------------
// 05.7 — MONTAGEM
// ------------------------------------------------------------

painel.append(
    cabecalho,
    mensagem,
    lista
);

componente.append(
    sino,
    painel
);


// ============================================================
// 06 — POSICIONAMENTO DO SINO
//
// Procuramos primeiro o cabeçalho da comunidade.
// Em seguida, cabeçalhos conhecidos do painel.
//
// Se não houver local compatível, o componente
// fica fixado no canto superior direito.
// ============================================================

function posicionarSino() {

    const destinos = [
        ".comunidade-topbar-acoes",
        ".painel-topbar-acoes",
        ".topbar-acoes",
        ".header-actions"
    ];

    let destino = null;

    for (const seletor of destinos) {

        destino = document.querySelector(seletor);

        if (destino) {
            break;
        }
    }


    if (destino) {

        componente.classList.add(
            "cojuris-notificacoes-integradas"
        );

        destino.prepend(componente);

    } else {

        componente.classList.add(
            "cojuris-notificacoes-flutuantes"
        );

        document.body.appendChild(componente);
    }

}

posicionarSino();


// ============================================================
// 07 — VALIDAÇÃO DO ACESSO
//
// Administradores ativos:
//   autorizados.
//
// Interessados pendentes ou aprovados:
//   autorizados.
//
// Rejeitados e cadastros inexistentes:
//   não autorizados.
//
// O Firebase continua responsável pela segurança
// efetiva das consultas.
// ============================================================

async function usuarioAutorizado(usuario) {

    const referenciaAdmin = doc(
        db,
        "administradores",
        usuario.uid
    );

    const admin = await getDoc(referenciaAdmin);

    if (
        admin.exists() &&
        admin.data().ativo === true
    ) {
        return true;
    }


    const referenciaInteressado = doc(
        db,
        "interessados",
        usuario.uid
    );

    const interessado = await getDoc(
        referenciaInteressado
    );

    if (!interessado.exists()) {
        return false;
    }

    return [
        "pendente",
        "aprovado"
    ].includes(interessado.data().status);
}


// ============================================================
// 08 — DATA DA PUBLICAÇÃO
// ============================================================

function formatarData(timestamp) {

    if (
        !timestamp ||
        typeof timestamp.toDate !== "function"
    ) {
        return "Comunicado institucional";
    }

    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }
    ).format(timestamp.toDate());
}


// ============================================================
// 09 — QUANTIDADE DE NÃO LIDOS
// ============================================================

function contarNaoLidos() {

    return comunicados.filter(
        comunicado => !idsLidos.has(comunicado.id)
    ).length;
}


// ============================================================
// 10 — ATUALIZAÇÃO DO CONTADOR
//
// O sino permanece visível para usuários autorizados
// mesmo quando o contador for igual a zero.
// ============================================================

function atualizarContador() {

    if (
        !comunicadosCarregados ||
        !leiturasCarregadas ||
        erroComunicados ||
        erroLeituras
    ) {

        contador.hidden = true;

        sino.setAttribute(
            "aria-label",
            "Notificações"
        );

        return;
    }


    const quantidade = contarNaoLidos();

    contador.textContent =
        quantidade > 99
            ? "99+"
            : String(quantidade);

    contador.hidden = quantidade === 0;


    if (quantidade === 0) {

        sino.setAttribute(
            "aria-label",
            "Notificações — nenhum comunicado não lido"
        );

    } else if (quantidade === 1) {

        sino.setAttribute(
            "aria-label",
            "Notificações — 1 comunicado não lido"
        );

    } else {

        sino.setAttribute(
            "aria-label",
            `Notificações — ${quantidade} comunicados não lidos`
        );
    }
}


// ============================================================
// 11 — REGISTRO INDIVIDUAL DE LEITURA
//
// Caminho:
//
// leituras_comunicados/{uid}/itens/{comunicadoId}
//
// Utilizamos serverTimestamp para registrar a data
// conforme as regras atuais do Firestore.
// ============================================================

async function registrarLeitura(comunicadoId) {

    if (!usuarioAtual) {
        return false;
    }

    if (idsLidos.has(comunicadoId)) {
        return true;
    }


    const uid = usuarioAtual.uid;

    const sessaoDaOperacao = versaoSessao;

    const referencia = doc(
        db,
        "leituras_comunicados",
        uid,
        "itens",
        comunicadoId
    );


    try {

        await setDoc(
            referencia,
            {
                lidoEm: serverTimestamp()
            }
        );


        // Não reutilizar resultados de uma sessão
        // que já tenha sido encerrada.

        if (
            sessaoDaOperacao !== versaoSessao ||
            !usuarioAtual ||
            usuarioAtual.uid !== uid
        ) {
            return false;
        }


        idsLidos.add(comunicadoId);

        renderizar();

        return true;

    } catch (erro) {

        console.error(
            "COJURIS — Registro de leitura:",
            erro.code || erro.message
        );

        mensagem.textContent =
            "Não foi possível registrar a leitura. Tente novamente.";

        return false;
    }
}


// ============================================================
// 12 — CRIAR CARTÃO DE NOTIFICAÇÃO
//
// Ordem visual:
// 1. Identificação institucional e status
// 2. Título
// 3. Data da publicação
//
// Preserva o conteúdo original do comunicado,
// mas mostra apenas as informações essenciais.
// ============================================================

function criarCartao(comunicado) {

    const lido = idsLidos.has(comunicado.id);

    const cartao = criarElemento(
        "button",
        lido
            ? "cojuris-notificacao lida"
            : "cojuris-notificacao nao-lida"
    );

    cartao.type = "button";


    // --------------------------------------------------------
    // 12.1 — CATEGORIA E STATUS
    // --------------------------------------------------------

    const topo = criarElemento(
        "div",
        "cojuris-notificacao-topo"
    );

    const categoria = criarElemento(
        "span",
        "cojuris-notificacao-categoria",
        "COMUNICADO OFICIAL"
    );

    const status = criarElemento(
        "span",
        "cojuris-notificacao-estado",
        lido ? "Visualizado" : "Novo"
    );

    topo.append(
        categoria,
        status
    );


    // --------------------------------------------------------
    // 12.2 — TÍTULO
    // --------------------------------------------------------

    const titulo = criarElemento(
        "strong",
        "cojuris-notificacao-titulo",
        comunicado.titulo || "Comunicado"
    );


    // --------------------------------------------------------
    // 12.3 — DATA
    // --------------------------------------------------------

    const data = criarElemento(
        "small",
        "cojuris-notificacao-data",
        formatarData(comunicado.publicadoEm)
    );


    // --------------------------------------------------------
    // 12.4 — MONTAGEM
    // --------------------------------------------------------

    cartao.append(
        topo,
        titulo,
        data
    );


    // --------------------------------------------------------
    // 12.5 — ABERTURA E REGISTRO DE LEITURA
    // --------------------------------------------------------

    cartao.addEventListener(
        "click",
        async () => {

            if (cartao.disabled) {
                return;
            }

            cartao.disabled = true;

            const registrado = await registrarLeitura(
                comunicado.id
            );

            if (registrado) {

                window.location.href =
                    DESTINO_COMUNICADOS;

            } else {

                cartao.disabled = false;
            }
        }
    );


    return cartao;
}


// ============================================================
// 13 — RENDERIZAR NOTIFICAÇÕES
// ============================================================

function renderizar() {

    atualizarContador();

    lista.replaceChildren();


    // --------------------------------------------------------
    // 13.1 — ERROS DE CONSULTA
    // --------------------------------------------------------

    if (erroComunicados || erroLeituras) {

        mensagem.textContent =
            "Não foi possível atualizar suas notificações. " +
            "Recarregue a página para tentar novamente.";

        return;
    }


    // --------------------------------------------------------
    // 13.2 — CARREGAMENTO
    // --------------------------------------------------------

    if (
        !comunicadosCarregados ||
        !leiturasCarregadas
    ) {

        mensagem.textContent =
            "Consultando seus comunicados...";

        return;
    }


    // --------------------------------------------------------
    // 13.3 — SEM PUBLICAÇÕES
    // --------------------------------------------------------

    if (comunicados.length === 0) {

        mensagem.textContent =
            "Nenhum comunicado publicado até o momento.";

        return;
    }


    // --------------------------------------------------------
    // 13.4 — TEXTO INFORMATIVO
    // --------------------------------------------------------

    const quantidade = contarNaoLidos();

    if (quantidade === 0) {

        mensagem.textContent =
            "Você está em dia com os comunicados.";

    } else if (quantidade === 1) {

        mensagem.textContent =
            "Você tem 1 comunicado não lido.";

    } else {

        mensagem.textContent =
            `Você tem ${quantidade} comunicados não lidos.`;
    }


    // --------------------------------------------------------
    // 13.5 — CRIAR A LISTA
    // --------------------------------------------------------

    const fragmento =
        document.createDocumentFragment();

    for (const comunicado of comunicados) {

        fragmento.appendChild(
            criarCartao(comunicado)
        );
    }

    lista.appendChild(fragmento);
}


// ============================================================
// 14 — CONSULTA EM TEMPO REAL
//
// onSnapshot acompanha:
// - publicações novas;
// - exclusões de comunicados;
// - leituras registradas pelo titular.
//
// Quando os dois conjuntos estiverem disponíveis,
// o contador será calculado corretamente.
// ============================================================

function iniciarObservadores(usuario, sessaoAtual) {


    // --------------------------------------------------------
    // 14.1 — COMUNICADOS
    // --------------------------------------------------------

    const consulta = query(
        collection(db, "comunicados"),
        orderBy("publicadoEm", "desc"),
        limit(LIMITE_COMUNICADOS)
    );


    cancelarComunicados = onSnapshot(

        consulta,

        resultado => {

            if (sessaoAtual !== versaoSessao) {
                return;
            }

            comunicados = resultado.docs.map(
                documento => ({
                    id: documento.id,
                    ...documento.data()
                })
            );

            erroComunicados = false;

            comunicadosCarregados = true;

            renderizar();
        },

        erro => {

            if (sessaoAtual !== versaoSessao) {
                return;
            }

            console.error(
                "COJURIS — Consulta de comunicados:",
                erro.code || erro.message
            );

            erroComunicados = true;

            renderizar();
        }
    );


    // --------------------------------------------------------
    // 14.2 — LEITURAS DO USUÁRIO
    // --------------------------------------------------------

    const referenciaLeituras = collection(
        db,
        "leituras_comunicados",
        usuario.uid,
        "itens"
    );


    cancelarLeituras = onSnapshot(

        referenciaLeituras,

        resultado => {

            if (sessaoAtual !== versaoSessao) {
                return;
            }

            idsLidos = new Set(
                resultado.docs.map(
                    documento => documento.id
                )
            );

            erroLeituras = false;

            leiturasCarregadas = true;

            renderizar();
        },

        erro => {

            if (sessaoAtual !== versaoSessao) {
                return;
            }

            console.error(
                "COJURIS — Consulta das leituras:",
                erro.code || erro.message
            );

            erroLeituras = true;

            renderizar();
        }
    );
}


// ============================================================
// 15 — ENCERRAMENTO DOS OBSERVADORES
//
// Previne consultas antigas após logout
// ou troca de usuário.
// ============================================================

function encerrarObservadores() {

    if (cancelarComunicados) {

        cancelarComunicados();

        cancelarComunicados = null;
    }

    if (cancelarLeituras) {

        cancelarLeituras();

        cancelarLeituras = null;
    }
}


// ============================================================
// 16 — ABRIR E FECHAR O PAINEL
//
// A janela utiliza posicionamento fixo e calcula
// a posição do sino na tela.
//
// Isso reduz problemas de corte por contêineres
// e mantém o painel próximo ao cabeçalho.
// ============================================================

function posicionarPainel() {

    const retangulo = sino.getBoundingClientRect();

    const larguraPainel = Math.min(
        360,
        window.innerWidth - 24
    );

    const margem = 12;

    const esquerda = Math.max(
        margem,
        Math.min(
            retangulo.right - larguraPainel,
            window.innerWidth - larguraPainel - margem
        )
    );

    let topo = retangulo.bottom + 12;

    // Se o espaço disponível abaixo do sino for
    // insuficiente, o painel será apresentado acima,
    // sempre que houver espaço.

    const alturaEstimada = 420;

    if (
        topo + alturaEstimada > window.innerHeight &&
        retangulo.top > alturaEstimada
    ) {

        topo = Math.max(
            margem,
            retangulo.top - alturaEstimada - 12
        );
    }

    painel.style.left = `${esquerda}px`;

    painel.style.top = `${topo}px`;

    painel.style.width = `${larguraPainel}px`;

    painel.style.maxHeight =
        `${Math.max(180, window.innerHeight - topo - margem)}px`;
}


function alternarPainel(abrir) {

    if (componente.hidden) {
        abrir = false;
    }

    painel.hidden = !abrir;

    sino.setAttribute(
        "aria-expanded",
        String(abrir)
    );

    if (abrir) {

        posicionarPainel();

        fechar.focus();
    }
}


// ============================================================
// 17 — AUTENTICAÇÃO
//
// O sino só aparece depois que o Firebase confirma
// que o usuário pode consultar os comunicados.
// ============================================================

onAuthStateChanged(

    auth,

    async usuario => {

        versaoSessao++;

        const sessaoAtual = versaoSessao;

        encerrarObservadores();


        // Limpa os dados da sessão anterior.

        usuarioAtual = null;

        comunicados = [];

        idsLidos = new Set();

        comunicadosCarregados = false;

        leiturasCarregadas = false;

        erroComunicados = false;

        erroLeituras = false;

        componente.hidden = true;

        alternarPainel(false);

        contador.hidden = true;


        if (!usuario) {
            return;
        }


        try {

            const autorizado = await usuarioAutorizado(
                usuario
            );


            if (sessaoAtual !== versaoSessao) {
                return;
            }

            if (!autorizado) {
                return;
            }


            usuarioAtual = usuario;

            componente.hidden = false;

            iniciarObservadores(
                usuario,
                sessaoAtual
            );

        } catch (erro) {

            if (sessaoAtual !== versaoSessao) {
                return;
            }

            console.error(
                "COJURIS — Verificação de acesso:",
                erro.code || erro.message
            );

            componente.hidden = true;
        }
    }
);


// ============================================================
// 18 — EVENTOS DA INTERFACE
// ============================================================


// Abre e fecha o painel ao clicar no sino.

sino.addEventListener(
    "click",
    () => {

        alternarPainel(painel.hidden);
    }
);


// Fecha a janela pelo botão próprio.

fechar.addEventListener(
    "click",
    () => {

        alternarPainel(false);

        sino.focus();
    }
);


// Fecha pelo teclado.

document.addEventListener(
    "keydown",
    evento => {

        if (evento.key === "Escape" && !painel.hidden) {

            alternarPainel(false);

            sino.focus();
        }
    }
);


// Fecha quando o usuário clica fora.

document.addEventListener(
    "click",
    evento => {

        if (
            !painel.hidden &&
            !componente.contains(evento.target)
        ) {

            alternarPainel(false);
        }
    }
);


// Reposiciona a janela quando o tamanho da tela muda.

window.addEventListener(
    "resize",
    () => {

        if (!painel.hidden) {
            posicionarPainel();
        }
    }
);


// Reposiciona o painel ao rolar a página.

window.addEventListener(
    "scroll",
    () => {

        if (!painel.hidden) {
            posicionarPainel();
        }
    },
    true
);
