
/* ============================================================
   COJURIS — MURAL PROFISSIONAL

   ARQUIVO: portal/js/recursos/mural.js

   FUNCIONALIDADES:
   01 — Firebase e configurações
   02 — Elementos da interface
   03 — Autenticação e identificação de perfil
   04 — Controle de cotas e intervalos
   05 — Autoria privada
   06 — Cartões de propostas
   07 — Comentários do mural
   08 — Listagem paginada
   09 — Publicação de propostas
   10 — Exclusão controlada
   11 — Inicialização e eventos

   SEGURANÇA:
   - Dados pessoais não aparecem nas publicações.
   - Autoria armazenada separadamente.
   - Operações atômicas no Firestore.
   - Limites validados pelas regras do Firebase.
   - Comentários separados dos comunicados.
   ============================================================ */


// ============================================================
// 01 — IMPORTAÇÕES
// ============================================================

import {
    auth,
    db
} from "../firebase-config.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    writeBatch,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";


// Módulo específico dos comentários profissionais.
import {
    criarComentariosMural
} from "./comentarios-mural.js";


// ============================================================
// 02 — CONFIGURAÇÕES
// ============================================================

const TAMANHO_PAGINA = 10;

const LIMITE_TITULO = 120;

const LIMITE_TEXTO_COOPERADO = 1000;
const LIMITE_TEXTO_ADMIN = 2000;

const LIMITE_PUBLICACOES = 2;

const JANELA_MS = 24 * 60 * 60 * 1000;
const INTERVALO_MS = 10 * 60 * 1000;

const CATEGORIAS = {
    sugestao: "Sugestão",
    discussao: "Discussão profissional",
    proposta: "Proposta institucional",
    duvida: "Dúvida"
};


// ============================================================
// 03 — ELEMENTOS HTML
// ============================================================

const $ = id => document.getElementById(id);

const telaAcesso = $("mural-acesso");
const mensagemAcesso = $("mural-mensagem-acesso");

const aplicacao = $("mural-app");

const indicadorPerfil = $("mural-perfil");
const linkAdministracao = $("mural-link-admin");

const areaPublicacao = $("mural-area-publicacao");
const avisoLeitura = $("mural-aviso-leitura");

const formulario = $("mural-formulario");

const tituloProposta = $("mural-titulo-proposta");
const categoriaProposta = $("mural-categoria");
const textoProposta = $("mural-texto");

const contadorCaracteres = $("mural-contador");

const botaoPublicar = $("mural-publicar");
const statusPublicacao = $("mural-status-publicacao");

const listaPublicacoes = $("mural-lista");
const statusListagem = $("mural-status-listagem");

const botaoAtualizar = $("mural-atualizar");
const botaoCarregarMais = $("mural-carregar-mais");


// ============================================================
// 04 — REFERÊNCIAS FIRESTORE
// ============================================================

const colecaoPublicacoes = collection(
    db,
    "mural_publicacoes"
);

const colecaoAutores = collection(
    db,
    "mural_autores"
);


// ============================================================
// 05 — ESTADO DA APLICAÇÃO
// ============================================================

let usuarioAtual = null;
let perfilAtual = "sem_sessao";

let versaoSessao = 0;

let publicando = false;
let carregando = false;

let ultimoDocumento = null;
let fimDaLista = false;

let idsProprios = new Set();

let inicioJanela = null;
let ultimoEm = null;
let quantidadeNaJanela = 0;

let cotaConsultada = false;
let relogio = null;


// ============================================================
// 06 — ELEMENTOS SEGUROS
// ============================================================

function elemento(tag, classe = "", texto = null) {

    const novo = document.createElement(tag);

    if (classe) {
        novo.className = classe;
    }

    if (texto !== null) {
        novo.textContent = String(texto);
    }

    return novo;
}


function botao(texto, classe = "") {

    const novo = elemento(
        "button",
        classe,
        texto
    );

    novo.type = "button";

    return novo;
}


function informarAcesso(texto) {
    mensagemAcesso.textContent = texto;
}


function informarPublicacao(texto) {
    statusPublicacao.textContent = texto;
}


function informarListagem(texto) {
    statusListagem.textContent = texto;
}


// ============================================================
// 07 — PERMISSÕES
// ============================================================

function sessaoValida(uid = usuarioAtual?.uid) {

    return Boolean(
        uid &&
        auth.currentUser &&
        auth.currentUser.uid === uid
    );
}


function podeVisualizar(perfil) {

    return [
        "administrador",
        "participante",
        "leitor"
    ].includes(perfil);
}


function podePublicar(perfil) {

    return [
        "administrador",
        "participante"
    ].includes(perfil);
}


// ============================================================
// 08 — FORMATAÇÃO
// ============================================================

function formatarData(timestamp) {

    const data = timestamp?.toDate?.();

    if (!data) {
        return "Agora";
    }

    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            dateStyle: "short",
            timeStyle: "short"
        }
    ).format(data);
}


function formatarDataLocal(data) {

    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            dateStyle: "short",
            timeStyle: "short"
        }
    ).format(data);
}


function formatarTempo(segundos) {

    const total = Math.max(
        0,
        Math.ceil(segundos)
    );

    const horas = Math.floor(total / 3600);

    const minutos = Math.floor(
        (total % 3600) / 60
    );

    const restantes = total % 60;

    const mm = String(minutos).padStart(2, "0");
    const ss = String(restantes).padStart(2, "0");

    if (horas > 0) {

        const hh = String(horas).padStart(2, "0");

        return `${hh}:${mm}:${ss}`;
    }

    return `${mm}:${ss}`;
}


// ============================================================
// 09 — IDENTIFICAR PERFIL
// ============================================================

async function identificarPerfil(usuario) {

    if (!usuario) {
        return "sem_sessao";
    }

    const admin = await getDoc(
        doc(db, "administradores", usuario.uid)
    );

    if (
        admin.exists() &&
        admin.data().ativo === true
    ) {
        return "administrador";
    }

    const interessado = await getDoc(
        doc(db, "interessados", usuario.uid)
    );

    if (!interessado.exists()) {
        return "sem_cadastro";
    }

    const dados = interessado.data();

    if (dados.status === "rejeitado") {
        return "rejeitado";
    }

    if (
        dados.status === "aprovado" &&
        dados.verificacaoProfissional === "verificada"
    ) {
        return "participante";
    }

    if (
        dados.status === "pendente" ||
        dados.status === "aprovado"
    ) {
        return "leitor";
    }

    return "sem_permissao";
}


// ============================================================
// 10 — ÁREA VISUAL DA COTA
// ============================================================

const informacaoCota = elemento(
    "p",
    "mural-privacidade"
);

informacaoCota.id = "mural-informacao-cota";

const avisoRelogio = elemento(
    "p",
    "mural-status"
);

avisoRelogio.id = "mural-aviso-relogio";
avisoRelogio.setAttribute("role", "status");

const acoesFormulario = formulario.querySelector(
    ".mural-form-acoes"
);

acoesFormulario.after(
    informacaoCota,
    avisoRelogio
);


// ============================================================
// 11 — CONTADOR DE CARACTERES
// ============================================================

function limiteTextoAtual() {

    return perfilAtual === "administrador"
        ? LIMITE_TEXTO_ADMIN
        : LIMITE_TEXTO_COOPERADO;
}


function atualizarContador() {

    const limite = limiteTextoAtual();

    textoProposta.maxLength = limite;

    contadorCaracteres.textContent =
        `${textoProposta.value.length} / ` +
        `${limite.toLocaleString("pt-BR")} caracteres`;
}


textoProposta.addEventListener(
    "input",
    atualizarContador
);


// ============================================================
// 12 — CONTROLE DE COTAS
// ============================================================

function janelaVigente() {

    return Boolean(
        inicioJanela &&
        Date.now() < inicioJanela.getTime() + JANELA_MS
    );
}


function cotaEsgotada() {

    return (
        janelaVigente() &&
        quantidadeNaJanela >= LIMITE_PUBLICACOES
    );
}


function atualizarInformacaoCota() {

    if (perfilAtual === "administrador") {

        informacaoCota.textContent =
            "Administração: publicações sem limite " +
            "diário ou intervalo obrigatório.";

        return;
    }

    if (perfilAtual !== "participante") {

        informacaoCota.textContent = "";
        return;
    }

    if (!cotaConsultada) {

        informacaoCota.textContent =
            "Consultando seu limite de participação...";

        return;
    }

    const utilizados = janelaVigente()
        ? quantidadeNaJanela
        : 0;

    const disponiveis = Math.max(
        0,
        LIMITE_PUBLICACOES - utilizados
    );

    informacaoCota.textContent =
        `${disponiveis} de ${LIMITE_PUBLICACOES} ` +
        "publicações disponíveis na janela de " +
        "24 horas. Intervalo mínimo de 10 minutos.";

    if (cotaEsgotada()) {

        const novaJanela = new Date(
            inicioJanela.getTime() + JANELA_MS
        );

        informacaoCota.textContent +=
            " Nova janela a partir de " +
            formatarDataLocal(novaJanela) +
            ".";
    }
}


// ============================================================
// 13 — DISPONIBILIDADE DE PUBLICAÇÃO
// ============================================================

function atualizarDisponibilidade() {

    if (
        !sessaoValida() ||
        !podePublicar(perfilAtual) ||
        publicando
    ) {

        botaoPublicar.disabled = true;
        return;
    }

    if (perfilAtual === "administrador") {

        botaoPublicar.disabled = false;
        avisoRelogio.textContent = "";
        return;
    }

    if (!cotaConsultada) {

        botaoPublicar.disabled = true;

        avisoRelogio.textContent =
            "Verificando disponibilidade...";

        return;
    }

    if (cotaEsgotada()) {

        const liberacao =
            inicioJanela.getTime() + JANELA_MS;

        const segundos = Math.ceil(
            (liberacao - Date.now()) / 1000
        );

        botaoPublicar.disabled = true;

        avisoRelogio.textContent =
            "Limite de publicações atingido. " +
            "Nova janela em " +
            formatarTempo(segundos) +
            ".";

        return;
    }

    if (ultimoEm) {

        const proxima =
            ultimoEm.getTime() + INTERVALO_MS;

        const segundos = Math.ceil(
            (proxima - Date.now()) / 1000
        );

        if (segundos > 0) {

            botaoPublicar.disabled = true;

            avisoRelogio.textContent =
                "Próxima publicação em " +
                formatarTempo(segundos) +
                ".";

            return;
        }
    }

    botaoPublicar.disabled = false;

    avisoRelogio.textContent =
        "Você pode publicar sua proposta.";
}


// ============================================================
// 14 — CONSULTAR COTA NO FIRESTORE
// ============================================================

async function consultarCota() {

    if (!sessaoValida()) {
        return;
    }

    if (perfilAtual === "administrador") {

        cotaConsultada = true;

        atualizarInformacaoCota();
        atualizarDisponibilidade();

        return;
    }

    if (perfilAtual !== "participante") {
        return;
    }

    const uid = usuarioAtual.uid;

    cotaConsultada = false;

    atualizarInformacaoCota();
    atualizarDisponibilidade();

    try {

        const resultado = await getDoc(
            doc(db, "limites_publicacoes", uid)
        );

        if (!sessaoValida(uid)) {
            return;
        }

        if (resultado.exists()) {

            const dados = resultado.data();

            inicioJanela =
                dados.inicioJanela?.toDate?.() || null;

            ultimoEm =
                dados.ultimoEm?.toDate?.() || null;

            quantidadeNaJanela =
                Number(dados.quantidade) || 0;

        } else {

            inicioJanela = null;
            ultimoEm = null;
            quantidadeNaJanela = 0;
        }

        cotaConsultada = true;

        atualizarInformacaoCota();
        atualizarDisponibilidade();

    } catch (erro) {

        console.error(
            "COJURIS — Consulta da cota:",
            erro
        );

        cotaConsultada = false;

        botaoPublicar.disabled = true;

        avisoRelogio.textContent =
            "Não foi possível verificar sua cota. " +
            "Atualize a página para tentar novamente.";
    }
}


// ============================================================
// 15 — RELÓGIO
// ============================================================

function pararRelogio() {

    if (relogio !== null) {

        clearInterval(relogio);
        relogio = null;
    }
}


function iniciarRelogio() {

    pararRelogio();

    if (perfilAtual !== "participante") {
        return;
    }

    relogio = setInterval(() => {

        if (!sessaoValida()) {

            pararRelogio();
            return;
        }

        atualizarInformacaoCota();
        atualizarDisponibilidade();

    }, 1000);
}


// ============================================================
// 16 — IDENTIFICAR PUBLICAÇÕES PRÓPRIAS
//
// Não consulta a autoria de outros participantes.
// ============================================================

async function carregarAutoriaPropria() {

    if (!sessaoValida()) {
        return;
    }

    const uid = usuarioAtual.uid;

    idsProprios = new Set();

    if (perfilAtual === "administrador") {
        return;
    }

    // Leitores não precisam identificar autoria.
    if (perfilAtual !== "participante") {
        return;
    }

    const consulta = query(
        colecaoAutores,
        where("autorUid", "==", uid)
    );

    const resultado = await getDocs(consulta);

    if (!sessaoValida(uid)) {
        return;
    }

    resultado.docs.forEach(documento => {
        idsProprios.add(documento.id);
    });
}


// ============================================================
// 17 — CARTÃO DE PUBLICAÇÃO
//
// Aqui integramos comentarios-mural.js.
// ============================================================

function criarCard(documento) {

    const dados = documento.data();

    const card = elemento(
        "article",
        "mural-item"
    );

    card.dataset.id = documento.id;

    // --------------------------------------------------------
    // 17.1 — IDENTIFICAÇÃO PÚBLICA
    // --------------------------------------------------------

    const topo = elemento(
        "div",
        "mural-item-topo"
    );

    const identificacao = elemento(
        "div",
        "mural-item-identificacao"
    );

    const avatar = elemento(
        "span",
        "mural-item-avatar",
        "✦"
    );

    avatar.setAttribute(
        "aria-hidden",
        "true"
    );

    const informacoes = elemento("div");

    const nomePublico = elemento(
        "strong",
        "mural-item-autor",
        "Participante COJURIS"
    );

    const data = elemento(
        "time",
        "mural-item-data",
        formatarData(dados.criadoEm)
    );

    informacoes.append(
        nomePublico,
        data
    );

    identificacao.append(
        avatar,
        informacoes
    );

    // --------------------------------------------------------
    // 17.2 — CATEGORIA
    // --------------------------------------------------------

    const categoria = elemento(
        "span",
        "mural-item-categoria",
        CATEGORIAS[dados.categoria] || "Publicação"
    );

    topo.append(
        identificacao,
        categoria
    );

    // --------------------------------------------------------
    // 17.3 — TÍTULO E TEXTO
    // --------------------------------------------------------

    const titulo = elemento(
        "h3",
        "mural-item-titulo",
        dados.titulo || ""
    );

    const texto = elemento(
        "p",
        "mural-item-texto",
        dados.texto || ""
    );

    const rodape = elemento(
        "div",
        "mural-item-rodape"
    );

    // --------------------------------------------------------
    // 17.4 — EXCLUSÃO
    // --------------------------------------------------------

    const podeExcluir =
        perfilAtual === "administrador" ||
        idsProprios.has(documento.id);

    if (podeExcluir) {

        const excluir = botao(
            "Excluir publicação",
            "mural-botao-secundario"
        );

        excluir.addEventListener(
            "click",
            () => excluirPublicacao(
                documento.id,
                card,
                excluir
            )
        );

        rodape.append(excluir);
    }

    // --------------------------------------------------------
    // 17.5 — COMENTÁRIOS
    //
    // Cada proposta recebe um componente independente.
    // Os comentários são carregados quando o usuário
    // abre a seção correspondente.
    // --------------------------------------------------------

    const comentarios = criarComentariosMural(
        documento.id
    );

    // --------------------------------------------------------
    // 17.6 — MONTAGEM FINAL
    // --------------------------------------------------------

    card.append(
        topo,
        titulo,
        texto,
        rodape,
        comentarios
    );

    return card;
}


// ============================================================
// 18 — LISTAGEM PAGINADA
// ============================================================

async function carregarPublicacoes(reiniciar = false) {

    if (
        carregando ||
        !sessaoValida() ||
        !podeVisualizar(perfilAtual)
    ) {
        return;
    }

    carregando = true;

    botaoAtualizar.disabled = true;
    botaoCarregarMais.disabled = true;

    informarListagem("Carregando publicações...");

    const uid = usuarioAtual.uid;
    const versao = versaoSessao;

    try {

        const filtros = [
            orderBy("criadoEm", "desc")
        ];

        if (!reiniciar && ultimoDocumento) {

            filtros.push(
                startAfter(ultimoDocumento)
            );
        }

        filtros.push(
            limit(TAMANHO_PAGINA)
        );

        const resultado = await getDocs(
            query(colecaoPublicacoes, ...filtros)
        );

        if (
            !sessaoValida(uid) ||
            versao !== versaoSessao
        ) {
            return;
        }

        if (reiniciar) {

            listaPublicacoes.replaceChildren();
            ultimoDocumento = null;
        }

        resultado.docs.forEach(documento => {

            listaPublicacoes.append(
                criarCard(documento)
            );
        });

        if (!resultado.empty) {

            ultimoDocumento =
                resultado.docs[resultado.docs.length - 1];
        }

        fimDaLista =
            resultado.size < TAMANHO_PAGINA;

        botaoCarregarMais.hidden = fimDaLista;

        informarListagem(
            listaPublicacoes.children.length === 0
                ? "Ainda não existem publicações no mural."
                : ""
        );

    } catch (erro) {

        console.error(
            "COJURIS — Listagem do mural:",
            erro
        );

        informarListagem(
            "Não foi possível carregar as publicações."
        );

    } finally {

        carregando = false;

        botaoAtualizar.disabled = false;
        botaoCarregarMais.disabled = fimDaLista;
    }
}


// ============================================================
// 19 — VALIDAÇÃO DA PROPOSTA
// ============================================================

function validarFormulario() {

    const titulo = tituloProposta.value.trim();
    const categoria = categoriaProposta.value;
    const texto = textoProposta.value.trim();

    if (
        titulo.length < 5 ||
        titulo.length > LIMITE_TITULO
    ) {

        informarPublicacao(
            "O título deve conter entre 5 e 120 caracteres."
        );

        return null;
    }

    if (!Object.hasOwn(CATEGORIAS, categoria)) {

        informarPublicacao(
            "Selecione uma categoria válida."
        );

        return null;
    }

    const limite = limiteTextoAtual();

    if (
        texto.length < 10 ||
        texto.length > limite
    ) {

        informarPublicacao(
            "O conteúdo deve conter entre 10 e " +
            `${limite.toLocaleString("pt-BR")} caracteres.`
        );

        return null;
    }

    return {
        titulo,
        categoria,
        texto
    };
}


// ============================================================
// 20 — PUBLICAÇÃO DE PROPOSTAS
//
// Administrador: lote de dois documentos.
// Participante: transação com três documentos.
// ============================================================

async function publicarProposta(evento) {

    evento.preventDefault();

    if (
        publicando ||
        botaoPublicar.disabled ||
        !sessaoValida() ||
        !podePublicar(perfilAtual)
    ) {
        return;
    }

    publicando = true;
    botaoPublicar.disabled = true;

    const uid = usuarioAtual.uid;

    try {

        // Revalidação antes da publicação.

        const perfilConfirmado =
            await identificarPerfil(auth.currentUser);

        if (
            !sessaoValida(uid) ||
            !podePublicar(perfilConfirmado)
        ) {
            throw new Error("PERFIL_NAO_AUTORIZADO");
        }

        perfilAtual = perfilConfirmado;

        atualizarContador();

        const dados = validarFormulario();

        if (!dados) {
            return;
        }

        informarPublicacao("Publicando proposta...");

        const novaPublicacao = doc(
            colecaoPublicacoes
        );

        const novaAutoria = doc(
            colecaoAutores,
            novaPublicacao.id
        );

        const conteudoPublico = {
            titulo: dados.titulo,
            categoria: dados.categoria,
            texto: dados.texto,
            criadoEm: serverTimestamp()
        };

        const autoriaPrivada = {
            autorUid: uid,
            criadoEm: serverTimestamp()
        };

        // ----------------------------------------------------
        // 20.1 — ADMINISTRAÇÃO
        // ----------------------------------------------------

        if (perfilAtual === "administrador") {

            const lote = writeBatch(db);

            lote.set(
                novaPublicacao,
                conteudoPublico
            );

            lote.set(
                novaAutoria,
                autoriaPrivada
            );

            await lote.commit();

        } else {

            // ------------------------------------------------
            // 20.2 — COOPERADO
            // ------------------------------------------------

            const referenciaLimite = doc(
                db,
                "limites_publicacoes",
                uid
            );

            await runTransaction(
                db,
                async transacao => {

                    // Todas as leituras antes das escritas.

                    const contador = await transacao.get(
                        referenciaLimite
                    );

                    const agora = Date.now();

                    let inicioAnterior = null;
                    let ultimoAnterior = null;
                    let quantidadeAnterior = 0;

                    if (contador.exists()) {

                        const anterior = contador.data();

                        inicioAnterior =
                            anterior.inicioJanela?.toDate?.()
                            || null;

                        ultimoAnterior =
                            anterior.ultimoEm?.toDate?.()
                            || null;

                        quantidadeAnterior =
                            Number(anterior.quantidade) || 0;
                    }

                    // Intervalo mínimo de dez minutos.

                    if (ultimoAnterior) {

                        const restante =
                            ultimoAnterior.getTime() +
                            INTERVALO_MS -
                            agora;

                        if (restante > 0) {

                            throw new Error(
                                "INTERVALO:" +
                                Math.ceil(restante / 1000)
                            );
                        }
                    }

                    // Janela individual de 24 horas.

                    const expirada =
                        !inicioAnterior ||
                        agora >= (
                            inicioAnterior.getTime() +
                            JANELA_MS
                        );

                    const quantidadeNova = expirada
                        ? 1
                        : quantidadeAnterior + 1;

                    if (
                        quantidadeNova > LIMITE_PUBLICACOES
                    ) {

                        throw new Error("LIMITE_DIARIO");
                    }

                    // Escritas atômicas.

                    transacao.set(
                        novaPublicacao,
                        conteudoPublico
                    );

                    transacao.set(
                        novaAutoria,
                        autoriaPrivada
                    );

                    transacao.set(
                        referenciaLimite,
                        {
                            inicioJanela: expirada
                                ? serverTimestamp()
                                : contador.data().inicioJanela,

                            quantidade: quantidadeNova,

                            ultimoEm: serverTimestamp(),

                            ultimaPublicacaoId:
                                novaPublicacao.id
                        }
                    );
                }
            );
        }

        if (!sessaoValida(uid)) {
            return;
        }

        formulario.reset();
        atualizarContador();

        idsProprios.add(
            novaPublicacao.id
        );

        await carregarPublicacoes(true);

        informarPublicacao(
            "Proposta publicada com sucesso."
        );

        await consultarCota();

    } catch (erro) {

        console.error(
            "COJURIS — Publicação:",
            erro
        );

        if (erro.message === "LIMITE_DIARIO") {

            informarPublicacao(
                "Você atingiu o limite de duas " +
                "publicações na janela de 24 horas."
            );

        } else if (
            erro.message?.startsWith("INTERVALO:")
        ) {

            const segundos = Number(
                erro.message.split(":")[1]
            );

            informarPublicacao(
                "Aguarde " +
                formatarTempo(segundos) +
                " para publicar novamente."
            );

        } else if (
            erro.message === "PERFIL_NAO_AUTORIZADO"
        ) {

            informarPublicacao(
                "Sua conta não está autorizada " +
                "a publicar propostas."
            );

        } else if (
            erro.code === "permission-denied"
        ) {

            informarPublicacao(
                "O Firebase recusou a publicação. " +
                "Verifique suas permissões e limites."
            );

        } else {

            informarPublicacao(
                "Não foi possível publicar a proposta."
            );
        }

        if (
            sessaoValida(uid) &&
            perfilAtual === "participante"
        ) {

            await consultarCota();
        }

    } finally {

        publicando = false;

        atualizarInformacaoCota();
        atualizarDisponibilidade();
    }
}


// ============================================================
// 21 — EXCLUSÃO CONTROLADA
//
// Uma proposta com comentários não será excluída
// diretamente pelo navegador nesta versão.
//
// Isso evita deixar comentários e autorias privadas
// órfãos no Firestore.
// ============================================================

async function excluirPublicacao(
    publicacaoId,
    card,
    botaoExcluir
) {

    if (!sessaoValida()) {
        return;
    }

    const autorizado =
        perfilAtual === "administrador" ||
        idsProprios.has(publicacaoId);

    if (!autorizado) {
        return;
    }

    const confirmado = window.confirm(
        "Deseja excluir esta publicação?"
    );

    if (!confirmado) {
        return;
    }

    botaoExcluir.disabled = true;

    const uid = usuarioAtual.uid;

    try {

        // Verificar se existem comentários associados.

        const referenciaComentarios = collection(
            db,
            "mural_publicacoes",
            publicacaoId,
            "comentarios"
        );

        const resultadoComentarios = await getDocs(
            query(
                referenciaComentarios,
                limit(1)
            )
        );

        if (!sessaoValida(uid)) {
            return;
        }

        if (!resultadoComentarios.empty) {

            informarListagem(
                "Esta proposta possui comentários e não " +
                "pode ser excluída diretamente. " +
                "A exclusão completa deverá ser realizada " +
                "por procedimento administrativo."
            );

            return;
        }

        const lote = writeBatch(db);

        lote.delete(
            doc(
                db,
                "mural_publicacoes",
                publicacaoId
            )
        );

        lote.delete(
            doc(
                db,
                "mural_autores",
                publicacaoId
            )
        );

        await lote.commit();

        if (!sessaoValida(uid)) {
            return;
        }

        idsProprios.delete(publicacaoId);

        card.remove();

        informarListagem(
            "Publicação excluída com sucesso."
        );

    } catch (erro) {

        console.error(
            "COJURIS — Exclusão:",
            erro
        );

        informarListagem(
            "Não foi possível excluir a publicação."
        );

    } finally {

        botaoExcluir.disabled = false;
    }
}


// ============================================================
// 22 — APRESENTAR INTERFACE
// ============================================================

function apresentarInterface() {

    if (!sessaoValida()) {
        return;
    }

    telaAcesso.hidden = true;
    aplicacao.hidden = false;

    const administrador =
        perfilAtual === "administrador";

    linkAdministracao.hidden = !administrador;

    areaPublicacao.hidden =
        !podePublicar(perfilAtual);

    avisoLeitura.hidden =
        perfilAtual !== "leitor";

    if (administrador) {

        indicadorPerfil.textContent =
            "Administração COJURIS";

    } else if (
        perfilAtual === "participante"
    ) {

        indicadorPerfil.textContent =
            "Cooperado verificado";

    } else {

        indicadorPerfil.textContent =
            "Aguardando verificação profissional";
    }

    botaoAtualizar.disabled = false;

    atualizarContador();
    atualizarInformacaoCota();
    atualizarDisponibilidade();
}


// ============================================================
// 23 — LIMPAR INTERFACE
// ============================================================

function ocultarAplicacao() {

    pararRelogio();

    aplicacao.hidden = true;
    telaAcesso.hidden = false;

    areaPublicacao.hidden = true;
    avisoLeitura.hidden = true;
    linkAdministracao.hidden = true;

    botaoPublicar.disabled = true;
    botaoAtualizar.disabled = true;

    botaoCarregarMais.disabled = true;
    botaoCarregarMais.hidden = true;

    listaPublicacoes.replaceChildren();

    ultimoDocumento = null;
    fimDaLista = false;

    idsProprios = new Set();

    inicioJanela = null;
    ultimoEm = null;
    quantidadeNaJanela = 0;

    cotaConsultada = false;

    informacaoCota.textContent = "";
    avisoRelogio.textContent = "";

    informarPublicacao("");
    informarListagem("Aguardando autorização...");

    indicadorPerfil.textContent =
        "Consultando seu perfil...";
}


// ============================================================
// 24 — AUTENTICAÇÃO
// ============================================================

onAuthStateChanged(
    auth,
    async usuario => {

        versaoSessao++;

        const sessaoDaConsulta = versaoSessao;

        usuarioAtual = null;
        perfilAtual = "sem_sessao";

        ocultarAplicacao();

        if (!usuario) {

            informarAcesso(
                "É necessário entrar na COJURIS " +
                "para acessar o mural."
            );

            return;
        }

        informarAcesso(
            "Verificando sua autorização..."
        );

        try {

            const perfil = await identificarPerfil(
                usuario
            );

            if (
                sessaoDaConsulta !== versaoSessao ||
                auth.currentUser?.uid !== usuario.uid
            ) {
                return;
            }

            if (!podeVisualizar(perfil)) {

                informarAcesso(
                    "Sua conta não possui autorização " +
                    "para acessar o mural."
                );

                return;
            }

            usuarioAtual = usuario;
            perfilAtual = perfil;

            apresentarInterface();

            try {

                await carregarAutoriaPropria();

            } catch (erro) {

                console.error(
                    "COJURIS — Autoria:",
                    erro
                );

                informarListagem(
                    "Não foi possível carregar " +
                    "as permissões de autoria."
                );

                return;
            }

            if (
                sessaoDaConsulta !== versaoSessao ||
                !sessaoValida(usuario.uid)
            ) {
                return;
            }

            await carregarPublicacoes(true);

            if (!sessaoValida(usuario.uid)) {
                return;
            }

            if (podePublicar(perfilAtual)) {

                await consultarCota();

                iniciarRelogio();
            }

        } catch (erro) {

            console.error(
                "COJURIS — Autenticação:",
                erro
            );

            if (
                sessaoDaConsulta !== versaoSessao
            ) {
                return;
            }

            ocultarAplicacao();

            informarAcesso(
                "Não foi possível verificar sua " +
                "autorização. Atualize a página."
            );
        }
    }
);


// ============================================================
// 25 — EVENTOS
// ============================================================

// Publicação de proposta.

formulario.addEventListener(
    "submit",
    publicarProposta
);


// Atualização manual da listagem.

botaoAtualizar.addEventListener(
    "click",
    async () => {

        if (!sessaoValida()) {
            return;
        }

        try {

            await carregarAutoriaPropria();

            await carregarPublicacoes(true);

            if (podePublicar(perfilAtual)) {
                await consultarCota();
            }

        } catch (erro) {

            console.error(
                "COJURIS — Atualização:",
                erro
            );

            informarListagem(
                "Não foi possível atualizar o mural."
            );
        }
    }
);


// Carregar próxima página de propostas.

botaoCarregarMais.addEventListener(
    "click",
    async () => {

        if (!fimDaLista) {
            await carregarPublicacoes(false);
        }
    }
);


/* ============================================================
   FIM — COJURIS / MURAL PROFISSIONAL

   Cada cartão contém agora:
   - Identificação institucional
   - Categoria
   - Título
   - Conteúdo
   - Exclusão autorizada
   - Comentários da publicação

   As regras do Firestore continuam responsáveis
   pela autorização efetiva das operações.
   ============================================================ */
