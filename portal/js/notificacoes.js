
/* ============================================================
   COJURIS — NOTIFICAÇÕES INTERNAS
   Arquivo: portal/js/notificacoes.js

   FUNCIONALIDADES:
   01 — Firebase e configuração
   02 — Estado individual da sessão
   03 — Construção do sino e painel
   04 — Posicionamento no cabeçalho
   05 — Autorização
   06 — Contador de não lidos
   07 — Registro de leitura
   08 — Dispensa individual de notificações
   09 — Lista visual
   10 — Observadores em tempo real
   11 — Controle de sessão
   12 — Acessibilidade e eventos

   IMPORTANTE:
   - Dispensar não exclui comunicados.
   - O administrador continua com gestão separada.
   - O Firestore valida todas as operações.
   ============================================================ */


// ============================================================
// 01 — FIREBASE
// ============================================================

import { auth, db } from "./firebase-config.js";

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
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";


// ============================================================
// 02 — CONFIGURAÇÕES
//
// O contador representa os 20 comunicados
// mais recentes, não todo o acervo histórico.
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

let idsDispensados = new Set();

let cancelarComunicados = null;

let cancelarLeituras = null;

let versaoSessao = 0;

let comunicadosCarregados = false;

let leiturasCarregadas = false;

let erroComunicados = false;

let erroLeituras = false;


// Evita duas operações simultâneas no mesmo item.

const operacoesEmAndamento = new Set();


// ============================================================
// 04 — FUNÇÃO SEGURA DE CRIAÇÃO DE ELEMENTOS
//
// Dados recebidos do Firebase são inseridos
// com textContent, nunca como HTML executável.
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
// 05 — CONSTRUÇÃO DA INTERFACE
// ============================================================

const componente = criarElemento(
    "div",
    "cojuris-notificacoes"
);

componente.hidden = true;


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


// Ícone SVG estático da própria aplicação.

const namespaceSvg =
    "http://www.w3.org/2000/svg";

const iconeSino = document.createElementNS(
    namespaceSvg,
    "svg"
);

iconeSino.setAttribute(
    "viewBox",
    "0 0 24 24"
);

iconeSino.setAttribute("width", "21");
iconeSino.setAttribute("height", "21");
iconeSino.setAttribute("fill", "none");
iconeSino.setAttribute("stroke", "currentColor");
iconeSino.setAttribute("stroke-width", "1.8");
iconeSino.setAttribute("stroke-linecap", "round");
iconeSino.setAttribute("stroke-linejoin", "round");
iconeSino.setAttribute("aria-hidden", "true");

const caminhoSino = document.createElementNS(
    namespaceSvg,
    "path"
);

caminhoSino.setAttribute(
    "d",
    "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"
);

const baseSino = document.createElementNS(
    namespaceSvg,
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
// 05.3 — PAINEL
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
// 05.4 — CABEÇALHO
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
// 05.5 — MENSAGEM E LISTA
// ------------------------------------------------------------

const mensagem = criarElemento(
    "p",
    "cojuris-notificacoes-mensagem",
    "Consultando seus comunicados..."
);

mensagem.setAttribute("role", "status");
mensagem.setAttribute("aria-live", "polite");

const lista = criarElemento(
    "div",
    "cojuris-notificacoes-lista"
);

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
// Primeiro procura ações do cabeçalho.
// Se não localizar, utiliza posição fixa.
// ============================================================

function posicionarSino() {

    const seletores = [
        ".comunidade-topbar-acoes",
        ".painel-topbar-acoes",
        ".topbar-acoes",
        ".header-actions"
    ];

    let destino = null;

    for (const seletor of seletores) {

        destino = document.querySelector(seletor);

        if (destino) break;
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
// 07 — AUTORIZAÇÃO
//
// Admin ativo, interessado pendente ou aprovado.
// Rejeitados e usuários sem cadastro são bloqueados.
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
// 08 — FORMATAÇÃO DA DATA
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
// 09 — CONTADOR DE COMUNICADOS NÃO LIDOS
//
// Notificações dispensadas não são contabilizadas.
// ============================================================

function contarNaoLidos() {

    return comunicados.filter(comunicado => {

        return (
            !idsLidos.has(comunicado.id) &&
            !idsDispensados.has(comunicado.id)
        );

    }).length;
}


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

    sino.setAttribute(
        "aria-label",
        quantidade === 0
            ? "Nenhum comunicado não lido"
            : quantidade === 1
                ? "1 comunicado não lido"
                : `${quantidade} comunicados não lidos`
    );
}


// ============================================================
// 10 — REGISTRO DE LEITURA
//
// Cria um documento individual, preservando
// o histórico após recarregar a página.
// ============================================================

async function registrarLeitura(comunicadoId) {

    if (!usuarioAtual) return false;

    if (idsLidos.has(comunicadoId)) {
        return true;
    }

    const uid = usuarioAtual.uid;

    const sessaoAtual = versaoSessao;

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

        if (
            sessaoAtual !== versaoSessao ||
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
            "COJURIS — Erro ao registrar leitura:",
            erro
        );

        if (sessaoAtual === versaoSessao) {

            mensagem.textContent =
                "Não foi possível registrar a leitura.";
        }

        return false;
    }
}


// ============================================================
// 11 — DISPENSAR NOTIFICAÇÃO
//
// Somente um comunicado já visualizado poderá
// ser retirado da lista pessoal.
//
// updateDoc altera apenas dispensadoEm.
// Não exclui o comunicado nem modifica lidoEm.
// ============================================================

async function dispensarNotificacao(comunicadoId) {

    if (!usuarioAtual) return false;

    if (!idsLidos.has(comunicadoId)) {
        return false;
    }

    if (idsDispensados.has(comunicadoId)) {
        return true;
    }

    const uid = usuarioAtual.uid;

    const sessaoAtual = versaoSessao;

    const referencia = doc(
        db,
        "leituras_comunicados",
        uid,
        "itens",
        comunicadoId
    );

    try {

        await updateDoc(
            referencia,
            {
                dispensadoEm: serverTimestamp()
            }
        );

        if (
            sessaoAtual !== versaoSessao ||
            !usuarioAtual ||
            usuarioAtual.uid !== uid
        ) {
            return false;
        }

        idsDispensados.add(comunicadoId);

        renderizar();

        return true;

    } catch (erro) {

        console.error(
            "COJURIS — Erro ao dispensar notificação:",
            erro
        );

        if (sessaoAtual === versaoSessao) {

            mensagem.textContent =
                "Não foi possível retirar a notificação.";
        }

        return false;
    }
}


// ============================================================
// 12 — CRIAÇÃO DA LINHA DE NOTIFICAÇÃO
//
// Estrutura sem botões aninhados:
//
// linha
//   ├── botão para abrir comunicado
//   └── botão × para dispensar (somente lidos)
// ============================================================

function criarCartao(comunicado) {

    const lido = idsLidos.has(comunicado.id);

    const linha = criarElemento(
        "div",
        lido
            ? "cojuris-notificacao-linha lida"
            : "cojuris-notificacao-linha nao-lida"
    );


    // --------------------------------------------------------
    // 12.1 — BOTÃO DE ABERTURA
    // --------------------------------------------------------

    const cartao = criarElemento(
        "button",
        lido
            ? "cojuris-notificacao lida"
            : "cojuris-notificacao nao-lida"
    );

    cartao.type = "button";

    cartao.title = "Abrir comunicado";


    // --------------------------------------------------------
    // 12.2 — CATEGORIA E ESTADO
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

    const estado = criarElemento(
        "span",
        "cojuris-notificacao-estado",
        lido ? "Visualizado" : "Novo"
    );

    topo.append(
        categoria,
        estado
    );


    // --------------------------------------------------------
    // 12.3 — TÍTULO E DATA
    // --------------------------------------------------------

    const titulo = criarElemento(
        "strong",
        "cojuris-notificacao-titulo",
        comunicado.titulo || "Comunicado"
    );

    const data = criarElemento(
        "small",
        "cojuris-notificacao-data",
        formatarData(comunicado.publicadoEm)
    );

    cartao.append(
        topo,
        titulo,
        data
    );


    // --------------------------------------------------------
    // 12.4 — ABERTURA DO COMUNICADO
    // --------------------------------------------------------

    cartao.addEventListener(
        "click",
        async () => {

            const chaveOperacao =
                `ler:${comunicado.id}`;

            if (
                operacoesEmAndamento.has(chaveOperacao)
            ) {
                return;
            }

            operacoesEmAndamento.add(chaveOperacao);

            cartao.disabled = true;

            try {

                const registrado = await registrarLeitura(
                    comunicado.id
                );

                if (registrado) {

                    window.location.href =
                        DESTINO_COMUNICADOS;

                } else if (cartao.isConnected) {

                    cartao.disabled = false;
                }

            } finally {

                operacoesEmAndamento.delete(
                    chaveOperacao
                );
            }
        }
    );

    linha.appendChild(cartao);


    // --------------------------------------------------------
    // 12.5 — BOTÃO × PARA COMUNICADOS VISUALIZADOS
    //
    // Fica fora do botão de abertura.
    // --------------------------------------------------------

    if (lido) {

        const dispensar = criarElemento(
            "button",
            "cojuris-notificacao-dispensar",
            "×"
        );

        dispensar.type = "button";

        dispensar.title =
            "Retirar da minha lista";

        dispensar.setAttribute(
            "aria-label",
            `Dispensar notificação: ${
                comunicado.titulo || "Comunicado"
            }`
        );

        dispensar.addEventListener(
            "click",
            async evento => {

                evento.stopPropagation();

                const chaveOperacao =
                    `dispensar:${comunicado.id}`;

                if (
                    operacoesEmAndamento.has(chaveOperacao)
                ) {
                    return;
                }

                operacoesEmAndamento.add(
                    chaveOperacao
                );

                dispensar.disabled = true;

                try {

                    const removido =
                        await dispensarNotificacao(
                            comunicado.id
                        );

                    if (
                        !removido &&
                        dispensar.isConnected
                    ) {
                        dispensar.disabled = false;
                    }

                } finally {

                    operacoesEmAndamento.delete(
                        chaveOperacao
                    );
                }
            }
        );

        linha.appendChild(dispensar);
    }

    return linha;
}


// ============================================================
// 13 — RENDERIZAÇÃO DA LISTA
//
// Comunicado dispensado não volta a ser mostrado
// quando o Firestore atualiza os observadores.
// ============================================================

function renderizar() {

    atualizarContador();

    lista.replaceChildren();


    // --------------------------------------------------------
    // 13.1 — ERRO DE CONSULTA
    // --------------------------------------------------------

    if (erroComunicados || erroLeituras) {

        mensagem.textContent =
            "Não foi possível atualizar suas notificações.";

        return;
    }


    // --------------------------------------------------------
    // 13.2 — AGUARDANDO DADOS
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
    // 13.3 — NENHUM COMUNICADO PUBLICADO
    // --------------------------------------------------------

    if (comunicados.length === 0) {

        mensagem.textContent =
            "Nenhum comunicado publicado.";

        return;
    }


    // --------------------------------------------------------
    // 13.4 — FILTRAR OS DISPENSADOS
    // --------------------------------------------------------

    const visiveis = comunicados.filter(
        comunicado => (
            !idsDispensados.has(comunicado.id)
        )
    );


    // --------------------------------------------------------
    // 13.5 — LISTA COMPLETAMENTE LIMPA
    // --------------------------------------------------------

    if (visiveis.length === 0) {

        mensagem.textContent =
            "Sua lista de notificações está limpa.";

        return;
    }


    // --------------------------------------------------------
    // 13.6 — RESUMO
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
    // 13.7 — MONTAR AS LINHAS
    // --------------------------------------------------------

    const fragmento =
        document.createDocumentFragment();

    for (const comunicado of visiveis) {

        fragmento.appendChild(
            criarCartao(comunicado)
        );
    }

    lista.appendChild(fragmento);
}


// ============================================================
// 14 — OBSERVADORES EM TEMPO REAL
//
// Consulta os 20 comunicados mais recentes
// e os registros individuais do usuário.
// ============================================================

function iniciarObservadores(
    usuario,
    sessaoAtual
) {

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

            if (
                sessaoAtual !== versaoSessao
            ) {
                return;
            }

            comunicados = resultado.docs.map(
                documento => ({
                    id: documento.id,
                    ...documento.data()
                })
            );

            comunicadosCarregados = true;
            erroComunicados = false;

            renderizar();
        },

        erro => {

            if (
                sessaoAtual !== versaoSessao
            ) {
                return;
            }

            console.error(
                "COJURIS — Consulta de comunicados:",
                erro
            );

            erroComunicados = true;

            renderizar();
        }
    );


    // --------------------------------------------------------
    // 14.2 — LEITURAS E DISPENSAS INDIVIDUAIS
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

            if (
                sessaoAtual !== versaoSessao
            ) {
                return;
            }

            const novosLidos = new Set();

            const novosDispensados = new Set();

            resultado.docs.forEach(documento => {

                const dados = documento.data();

                if (dados.lidoEm) {

                    novosLidos.add(documento.id);
                }

                if (dados.dispensadoEm) {

                    novosDispensados.add(
                        documento.id
                    );
                }
            });

            idsLidos = novosLidos;

            idsDispensados = novosDispensados;

            leiturasCarregadas = true;
            erroLeituras = false;

            renderizar();
        },

        erro => {

            if (
                sessaoAtual !== versaoSessao
            ) {
                return;
            }

            console.error(
                "COJURIS — Consulta de leituras:",
                erro
            );

            erroLeituras = true;

            renderizar();
        }
    );
}


// ============================================================
// 15 — ENCERRAR CONSULTAS DA SESSÃO
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
// 16 — POSICIONAMENTO DO PAINEL
//
// A janela não desloca o conteúdo da comunidade.
// ============================================================

function posicionarPainel() {

    const retangulo =
        sino.getBoundingClientRect();

    const margem = 12;

    const largura = Math.min(
        360,
        Math.max(
            240,
            window.innerWidth - 2 * margem
        )
    );

    const esquerda = Math.max(
        margem,
        Math.min(
            retangulo.right - largura,
            window.innerWidth - largura - margem
        )
    );

    const espacoAbaixo =
        window.innerHeight - retangulo.bottom - margem;

    const espacoAcima =
        retangulo.top - margem;

    const abrirAcima =
        espacoAbaixo < 240 &&
        espacoAcima > espacoAbaixo;

    const alturaMaxima = Math.max(
        120,
        Math.min(
            460,
            abrirAcima
                ? espacoAcima - 12
                : espacoAbaixo - 12
        )
    );

    painel.style.left = `${esquerda}px`;

    painel.style.width = `${largura}px`;

    painel.style.maxHeight =
        `${alturaMaxima}px`;

    if (abrirAcima) {

        painel.style.top = "auto";

        painel.style.bottom =
            `${window.innerHeight - retangulo.top + 12}px`;

    } else {

        painel.style.bottom = "auto";

        painel.style.top =
            `${retangulo.bottom + 12}px`;
    }
}


// ============================================================
// 17 — ABERTURA E FECHAMENTO
// ============================================================

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
// 18 — AUTENTICAÇÃO E TROCA DE SESSÃO
// ============================================================

onAuthStateChanged(

    auth,

    async usuario => {

        versaoSessao++;

        const sessaoAtual = versaoSessao;

        encerrarObservadores();

        usuarioAtual = null;

        comunicados = [];

        idsLidos = new Set();

        idsDispensados = new Set();

        operacoesEmAndamento.clear();

        comunicadosCarregados = false;

        leiturasCarregadas = false;

        erroComunicados = false;

        erroLeituras = false;

        alternarPainel(false);

        componente.hidden = true;

        contador.hidden = true;

        if (!usuario) {
            return;
        }

        try {

            const autorizado =
                await usuarioAutorizado(usuario);

            if (
                sessaoAtual !== versaoSessao
            ) {
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

            if (
                sessaoAtual !== versaoSessao
            ) {
                return;
            }

            console.error(
                "COJURIS — Autorização:",
                erro
            );

            componente.hidden = true;
        }
    }
);


// ============================================================
// 19 — EVENTOS DA INTERFACE
// ============================================================

// Abrir e fechar o painel.

sino.addEventListener(
    "click",
    () => alternarPainel(painel.hidden)
);


// Fechar pelo × do cabeçalho.

fechar.addEventListener(
    "click",
    () => {

        alternarPainel(false);
        sino.focus();
    }
);


// Fechar pelo teclado.

document.addEventListener(
    "keydown",
    evento => {

        if (
            evento.key === "Escape" &&
            !painel.hidden
        ) {

            alternarPainel(false);

            sino.focus();
        }
    }
);


// Fechar ao clicar fora.

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


// Ajustar em mudança de tamanho de tela.

window.addEventListener(
    "resize",
    () => {

        if (!painel.hidden) {
            posicionarPainel();
        }
    }
);


// Ajustar após rolagem.

window.addEventListener(
    "scroll",
    () => {

        if (!painel.hidden) {
            posicionarPainel();
        }
    },
    true
);
