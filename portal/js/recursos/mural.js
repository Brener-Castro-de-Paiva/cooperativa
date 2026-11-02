
/* ============================================================
   COJURIS — MURAL PROFISSIONAL
   ARQUIVO: portal/js/recursos/mural.js

   RECURSOS:
   01. Autenticação e autorização
   02. Perfis de administrador, participante e leitor
   03. Autoria privada
   04. Limites por janela de 24 horas
   05. Intervalo mínimo de 10 minutos
   06. Contagem regressiva
   07. Publicação atômica
   08. Listagem com paginação
   09. Exclusão pelo autor ou administrador

   COOPERADO:
   - 2 publicações por janela de 24 horas;
   - intervalo de 10 minutos;
   - texto de 10 a 1.000 caracteres.

   ADMINISTRAÇÃO:
   - sem cota ou intervalo;
   - texto de 10 a 2.000 caracteres.

   O servidor aplica as regras do Firestore.
   O JavaScript apenas complementa a experiência.
   ============================================================ */


// ============================================================
// 01 — FIREBASE
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
// 03 — ELEMENTOS HTML EXISTENTES
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
// 04 — REFERÊNCIAS DO FIRESTORE
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


function sessaoValida() {

    return (
        usuarioAtual !== null &&
        auth.currentUser !== null &&
        auth.currentUser.uid === usuarioAtual.uid
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
// 07 — FORMATAÇÃO
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
// 08 — PERFIL
// ============================================================

async function identificarPerfil(usuario) {

    if (!usuario) {
        return "sem_sessao";
    }

    const admin = await getDoc(
        doc(
            db,
            "administradores",
            usuario.uid
        )
    );

    if (
        admin.exists() &&
        admin.data().ativo === true
    ) {
        return "administrador";
    }

    const interessado = await getDoc(
        doc(
            db,
            "interessados",
            usuario.uid
        )
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
// 09 — ÁREA VISUAL DOS LIMITES
//
// Criada pelo JavaScript para não exigir
// alterações em mural.html.
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

// Inserimos os avisos após o botão de publicação.

const acoesFormulario = formulario.querySelector(
    ".mural-form-acoes"
);

acoesFormulario.after(
    informacaoCota,
    avisoRelogio
);


// ============================================================
// 10 — CONTADOR DE CARACTERES
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
// 11 — CONTROLE DA JANELA DE 24 HORAS
// ============================================================

function janelaVigente() {

    if (!inicioJanela) {
        return false;
    }

    return Date.now() < (
        inicioJanela.getTime() + JANELA_MS
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


function formatarDataLocal(data) {

    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            dateStyle: "short",
            timeStyle: "short"
        }
    ).format(data);
}


// ============================================================
// 12 — RELÓGIO E BOTÃO DE PUBLICAÇÃO
//
// Prioridade:
// 1. Publicação em andamento
// 2. Cota de 24 horas
// 3. Intervalo de 10 minutos
// 4. Publicação liberada
// ============================================================

function atualizarDisponibilidade() {

    if (!sessaoValida()) {

        botaoPublicar.disabled = true;

        return;
    }

    if (!podePublicar(perfilAtual)) {

        botaoPublicar.disabled = true;

        return;
    }

    if (publicando) {

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

    const agora = Date.now();

    // --------------------------------------------------------
    // 12.1 — COTA ESGOTADA
    // --------------------------------------------------------

    if (cotaEsgotada()) {

        const liberacao =
            inicioJanela.getTime() + JANELA_MS;

        const segundos = Math.ceil(
            (liberacao - agora) / 1000
        );

        botaoPublicar.disabled = true;

        avisoRelogio.textContent =
            "Limite de publicações atingido. " +
            "Nova janela em " +
            formatarTempo(segundos) +
            ".";

        return;
    }

    // --------------------------------------------------------
    // 12.2 — INTERVALO MÍNIMO
    // --------------------------------------------------------

    if (ultimoEm) {

        const proximaPublicacao =
            ultimoEm.getTime() + INTERVALO_MS;

        const segundos = Math.ceil(
            (proximaPublicacao - agora) / 1000
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

    // --------------------------------------------------------
    // 12.3 — LIBERADO
    // --------------------------------------------------------

    botaoPublicar.disabled = false;

    avisoRelogio.textContent =
        "Você pode publicar sua proposta.";
}


// ============================================================
// 13 — CONSULTAR CONTADOR INDIVIDUAL
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
            doc(
                db,
                "limites_publicacoes",
                uid
            )
        );

        if (
            !sessaoValida() ||
            usuarioAtual.uid !== uid
        ) {
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
            "Não foi possível verificar a cota. " +
            "Atualize a página para tentar novamente.";
    }
}


// ============================================================
// 14 — ATUALIZAÇÃO DO RELÓGIO
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

    relogio = setInterval(
        () => {

            if (!sessaoValida()) {

                pararRelogio();

                return;
            }

            atualizarInformacaoCota();
            atualizarDisponibilidade();

        },
        1000
    );
}


// ============================================================
// 15 — IDENTIFICAR PUBLICAÇÕES PRÓPRIAS
//
// Nenhum cooperado recebe dados de autoria
// pertencentes a outros participantes.
// ============================================================

async function carregarAutoriaPropria() {

    if (!sessaoValida()) {
        return;
    }

    idsProprios = new Set();

    if (perfilAtual === "administrador") {
        return;
    }

    const uid = usuarioAtual.uid;

    const consulta = query(
        colecaoAutores,
        where("autorUid", "==", uid)
    );

    const resultado = await getDocs(consulta);

    if (
        !sessaoValida() ||
        usuarioAtual.uid !== uid
    ) {
        return;
    }

    resultado.docs.forEach(documento => {

        idsProprios.add(documento.id);
    });
}


// ============================================================
// 16 — CARD DE PUBLICAÇÃO
// ============================================================

function criarCard(documento) {

    const dados = documento.data();

    const card = elemento(
        "article",
        "mural-item"
    );

    card.dataset.id = documento.id;

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

    const categoria = elemento(
        "span",
        "mural-item-categoria",
        CATEGORIAS[dados.categoria] || "Publicação"
    );

    topo.append(
        identificacao,
        categoria
    );

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

    // A autoria efetiva permanece na coleção privada.
    // O administrador pode excluir qualquer publicação.

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

    card.append(
        topo,
        titulo,
        texto,
        rodape
    );

    return card;
}


// ============================================================
// 17 — LISTAGEM PAGINADA
//
// Apenas dez publicações por consulta.
// ============================================================

async function carregarPublicacoes(
    reiniciar = false
) {

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

    informarListagem(
        "Carregando publicações..."
    );

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
            query(
                colecaoPublicacoes,
                ...filtros
            )
        );

        if (!sessaoValida()) {
            return;
        }

        if (reiniciar) {

            listaPublicacoes.replaceChildren();

            ultimoDocumento = null;
        }

        resultado.docs.forEach(documento => {

            listaPublicacoes.appendChild(
                criarCard(documento)
            );
        });

        if (!resultado.empty) {

            ultimoDocumento =
                resultado.docs[
                    resultado.docs.length - 1
                ];
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
// 18 — VALIDAÇÃO DO FORMULÁRIO
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
            "O título deve conter entre 5 e " +
            "120 caracteres."
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
// 19 — PUBLICAÇÃO NO FIRESTORE
//
// Administrador:
//   2 documentos em writeBatch.
//
// Cooperado:
//   3 documentos em runTransaction.
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

        // Revalidar o perfil antes da gravação.

        const perfilConfirmado =
            await identificarPerfil(
                auth.currentUser
            );

        if (
            !sessaoValida() ||
            !podePublicar(perfilConfirmado)
        ) {

            throw new Error(
                "PERFIL_NAO_AUTORIZADO"
            );
        }

        perfilAtual = perfilConfirmado;

        atualizarContador();

        const dados = validarFormulario();

        if (!dados) {
            return;
        }

        informarPublicacao(
            "Publicando proposta..."
        );

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
        // 19.1 — ADMINISTRADOR
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
            // 19.2 — COOPERADO: TRANSAÇÃO
            // ------------------------------------------------

            const referenciaLimite = doc(
                db,
                "limites_publicacoes",
                uid
            );

            await runTransaction(
                db,
                async transacao => {

                    // Todas as leituras da transação
                    // devem ocorrer antes das gravações.

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

                    // ----------------------------------------
                    // INTERVALO DE 10 MINUTOS
                    // ----------------------------------------

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

                    // ----------------------------------------
                    // JANELA DE 24 HORAS
                    // ----------------------------------------

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
                        quantidadeNova >
                        LIMITE_PUBLICACOES
                    ) {

                        throw new Error(
                            "LIMITE_DIARIO"
                        );
                    }

                    // ----------------------------------------
                    // GRAVAÇÕES ATÔMICAS
                    // ----------------------------------------

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

        if (!sessaoValida()) {
            return;
        }

        // ----------------------------------------------------
        // 19.3 — ATUALIZAÇÃO DA INTERFACE
        // ----------------------------------------------------

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

        } else if (
            erro.code === "unavailable"
        ) {

            informarPublicacao(
                "O Firebase está indisponível. " +
                "Tente novamente."
            );

        } else {

            informarPublicacao(
                "Não foi possível publicar a proposta."
            );
        }

        // Atualiza a cota após um conflito ou
        // uma negativa de frequência.

        if (
            sessaoValida() &&
            perfilAtual === "participante" &&
            (
                erro.message === "LIMITE_DIARIO" ||
                erro.message?.startsWith("INTERVALO:") ||
                erro.code === "permission-denied"
            )
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
// 20 — EXCLUSÃO
//
// Publicação e autoria são excluídas juntas.
// O contador individual permanece inalterado.
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

    try {

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

        if (!sessaoValida()) {
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

        botaoExcluir.disabled = false;

        informarListagem(
            "Não foi possível excluir a publicação."
        );
    }
}


// ============================================================
// 21 — APRESENTAR A INTERFACE
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

    } else if (perfilAtual === "participante") {

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
// 22 — LIMPAR A INTERFACE
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
// 23 — AUTENTICAÇÃO
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

            // Autorias privadas são consultadas
            // antes da montagem dos cards.

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
                !sessaoValida()
            ) {
                return;
            }

            await carregarPublicacoes(true);

            if (!sessaoValida()) {
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
// 24 — EVENTOS
// ============================================================

formulario.addEventListener(
    "submit",
    publicarProposta
);


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


botaoCarregarMais.addEventListener(
    "click",
    async () => {

        if (!fimDaLista) {

            await carregarPublicacoes(false);
        }
    }
);
