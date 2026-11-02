
/* ============================================================
   COJURIS — COMENTÁRIOS DO MURAL PROFISSIONAL

   ARQUIVO:
   portal/js/recursos/comentarios-mural.js

   RESPONSABILIDADES:
   01. Identificar o perfil do usuário
   02. Construir a interface dos comentários
   03. Consultar a autoria privada
   04. Listar comentários com paginação
   05. Consultar o limite individual
   06. Exibir contagem regressiva
   07. Publicar comentários com segurança
   08. Excluir comentários autorizados

   POLÍTICA:

   COOPERADO:
   - Até 500 caracteres por comentário
   - Dois comentários por janela de 24 horas
   - Intervalo mínimo de três minutos

   ADMINISTRADOR:
   - Até 2.000 caracteres
   - Sem limite de quantidade ou intervalo

   PRIVACIDADE:
   - Nenhum UID, e-mail ou nome no comentário público
   - Autoria armazenada em coleção separada
   - O Firestore valida as permissões efetivas

   Este módulo não altera comentarios.js.
   ============================================================ */


// ============================================================
// 01 — IMPORTAÇÕES
// ============================================================

import {
    auth,
    db
} from "../firebase-config.js";

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
    runTransaction,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";


// ============================================================
// 02 — CONFIGURAÇÕES
// ============================================================

const TAMANHO_PAGINA = 10;

const LIMITE_COOPERADO = 500;
const LIMITE_ADMIN = 2000;

const MAXIMO_COMENTARIOS = 2;

const JANELA_MS = 24 * 60 * 60 * 1000;
const INTERVALO_MS = 3 * 60 * 1000;


// ============================================================
// 03 — FUNÇÕES VISUAIS SEGURAS
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

    const novo = elemento("button", classe, texto);

    novo.type = "button";

    return novo;
}


function formatarData(timestamp) {

    const data = timestamp?.toDate?.();

    if (!data) {
        return "Agora";
    }

    return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short"
    }).format(data);
}


function formatarTempo(ms) {

    const segundos = Math.max(0, Math.ceil(ms / 1000));

    const horas = Math.floor(segundos / 3600);

    const minutos = Math.floor(
        (segundos % 3600) / 60
    );

    const restantes = segundos % 60;

    const mm = String(minutos).padStart(2, "0");
    const ss = String(restantes).padStart(2, "0");

    if (horas > 0) {

        const hh = String(horas).padStart(2, "0");

        return `${hh}:${mm}:${ss}`;
    }

    return `${mm}:${ss}`;
}


// ============================================================
// 04 — IDENTIFICAÇÃO DO PERFIL
//
// A interface consulta o perfil, mas a autorização
// definitiva pertence às regras do Firestore.
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
// 05 — COMPONENTE DOS COMENTÁRIOS
//
// Utilização futura em mural.js:
//
// criarComentariosMural(publicacao.id)
//
// A função apenas cria o componente.
// Os dados são consultados quando ele é aberto.
// ============================================================

export function criarComentariosMural(publicacaoId) {

    if (
        typeof publicacaoId !== "string" ||
        !/^[A-Za-z0-9_-]+$/.test(publicacaoId)
    ) {
        throw new Error(
            "Identificador da publicação inválido."
        );
    }

    // --------------------------------------------------------
    // 05.1 — REFERÊNCIAS
    // --------------------------------------------------------

    const referenciaComentarios = collection(
        db,
        "mural_publicacoes",
        publicacaoId,
        "comentarios"
    );

    const referenciaAutores = collection(
        db,
        "mural_comentarios_autores"
    );

    // --------------------------------------------------------
    // 05.2 — ELEMENTOS PRINCIPAIS
    // --------------------------------------------------------

    const raiz = elemento(
        "section",
        "cj-comentarios"
    );

    const alternar = botao(
        "Comentários",
        "cj-comentarios-alternar"
    );

    alternar.setAttribute("aria-expanded", "false");

    const corpo = elemento(
        "div",
        "cj-comentarios-corpo"
    );

    corpo.hidden = true;

    const lista = elemento(
        "ol",
        "cj-comentarios-lista"
    );

    const carregarMais = botao(
        "Ver mais comentários",
        "cj-link"
    );

    carregarMais.hidden = true;

    const status = elemento(
        "p",
        "cj-status"
    );

    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    // --------------------------------------------------------
    // 05.3 — FORMULÁRIO
    // --------------------------------------------------------

    const formulario = elemento(
        "form",
        "cj-comentario-form"
    );

    formulario.hidden = true;

    const campo = elemento(
        "textarea",
        "cj-campo"
    );

    campo.rows = 3;
    campo.required = true;
    campo.maxLength = LIMITE_COOPERADO;

    campo.placeholder =
        "Contribua com esta discussão...";

    campo.setAttribute(
        "aria-label",
        "Texto do comentário"
    );

    const contador = elemento(
        "p",
        "cj-contador-caracteres",
        "0 / 500 caracteres"
    );

    const enviar = elemento(
        "button",
        "cj-botao",
        "Publicar comentário"
    );

    enviar.type = "submit";

    const informacaoCota = elemento(
        "p",
        "cj-politica-comentarios"
    );

    const avisoIntervalo = elemento(
        "p",
        "cj-aviso-intervalo"
    );

    avisoIntervalo.setAttribute(
        "aria-live",
        "off"
    );

    formulario.append(
        campo,
        contador,
        enviar,
        informacaoCota,
        avisoIntervalo
    );

    corpo.append(
        lista,
        carregarMais,
        status,
        formulario
    );

    raiz.append(
        alternar,
        corpo
    );

    // ========================================================
    // 06 — ESTADO LOCAL
    // ========================================================

    let usuarioAtual = null;
    let perfilAtual = "sem_sessao";

    let idsProprios = new Set();

    let ultimoDocumento = null;
    let fimDaLista = false;

    let carregando = false;
    let publicando = false;
    let inicializando = false;

    let inicioJanela = null;
    let ultimoEm = null;
    let quantidade = 0;

    let cotaConsultada = false;

    let relogio = null;

    // Identifica operações iniciadas antes de uma
    // mudança de sessão ou fechamento do componente.
    let versao = 0;

    // ========================================================
    // 07 — CONTROLE DE SESSÃO
    // ========================================================

    function sessaoValida(uid = usuarioAtual?.uid) {

        return Boolean(
            uid &&
            auth.currentUser &&
            auth.currentUser.uid === uid
        );
    }


    function perfilPodeComentar() {

        return (
            perfilAtual === "participante" ||
            perfilAtual === "administrador"
        );
    }


    // ========================================================
    // 08 — CONTADOR DE CARACTERES
    // ========================================================

    function atualizarCaracteres() {

        const maximo =
            perfilAtual === "administrador"
                ? LIMITE_ADMIN
                : LIMITE_COOPERADO;

        campo.maxLength = maximo;

        contador.textContent =
            `${campo.value.length} / ${maximo} caracteres`;
    }

    campo.addEventListener(
        "input",
        atualizarCaracteres
    );


    // ========================================================
    // 09 — COTA INDIVIDUAL
    // ========================================================

    function janelaVigente() {

        return Boolean(
            inicioJanela &&
            Date.now() < inicioJanela.getTime() + JANELA_MS
        );
    }


    function cotaEsgotada() {

        return (
            janelaVigente() &&
            quantidade >= MAXIMO_COMENTARIOS
        );
    }


    function atualizarDisponibilidade() {

        if (!perfilPodeComentar()) {

            enviar.disabled = true;
            return;
        }

        if (publicando) {

            enviar.disabled = true;
            return;
        }

        if (perfilAtual === "administrador") {

            enviar.disabled = false;

            informacaoCota.textContent =
                "Administração: comentários sem limite diário.";

            avisoIntervalo.textContent = "";

            return;
        }

        if (!cotaConsultada) {

            enviar.disabled = true;

            informacaoCota.textContent =
                "Consultando limite de participação...";

            return;
        }

        const utilizados = janelaVigente()
            ? quantidade
            : 0;

        const disponiveis = Math.max(
            0,
            MAXIMO_COMENTARIOS - utilizados
        );

        informacaoCota.textContent =
            `${disponiveis} de ${MAXIMO_COMENTARIOS} ` +
            "comentários disponíveis por janela de 24 horas.";

        if (cotaEsgotada()) {

            const liberacao =
                inicioJanela.getTime() + JANELA_MS;

            enviar.disabled = true;

            avisoIntervalo.textContent =
                "Limite atingido. Nova janela em " +
                formatarTempo(liberacao - Date.now()) +
                ".";

            return;
        }

        if (ultimoEm) {

            const liberacao =
                ultimoEm.getTime() + INTERVALO_MS;

            if (Date.now() < liberacao) {

                enviar.disabled = true;

                avisoIntervalo.textContent =
                    "Próximo comentário em " +
                    formatarTempo(liberacao - Date.now()) +
                    ".";

                return;
            }
        }

        enviar.disabled = false;

        avisoIntervalo.textContent =
            "Você pode publicar seu comentário.";
    }


    // ========================================================
    // 10 — CONSULTAR CONTADOR NO FIRESTORE
    // ========================================================

    async function consultarCota() {

        if (!sessaoValida()) {
            return;
        }

        if (perfilAtual === "administrador") {

            cotaConsultada = true;
            atualizarDisponibilidade();

            return;
        }

        const uid = usuarioAtual.uid;

        cotaConsultada = false;
        atualizarDisponibilidade();

        try {

            const resultado = await getDoc(
                doc(
                    db,
                    "limites_comentarios_mural",
                    uid
                )
            );

            if (!sessaoValida(uid)) {
                return;
            }

            if (!resultado.exists()) {

                inicioJanela = null;
                ultimoEm = null;
                quantidade = 0;

            } else {

                const dados = resultado.data();

                inicioJanela =
                    dados.inicioJanela?.toDate?.() || null;

                ultimoEm =
                    dados.ultimoEm?.toDate?.() || null;

                quantidade =
                    Number(dados.quantidade) || 0;
            }

            cotaConsultada = true;

            atualizarDisponibilidade();

        } catch (erro) {

            console.error(
                "COJURIS — Consulta de cota do mural:",
                erro
            );

            cotaConsultada = false;
            enviar.disabled = true;

            avisoIntervalo.textContent =
                "Não foi possível consultar sua cota.";
        }
    }


    // ========================================================
    // 11 — CONSULTAR AUTORIA PRIVADA
    //
    // Apenas documentos do próprio usuário são
    // consultados. A consulta usa filtro por UID.
    // ========================================================

    async function carregarAutoria() {

        idsProprios = new Set();

        if (!sessaoValida()) {
            return;
        }

        if (perfilAtual !== "participante") {
            return;
        }

        const uid = usuarioAtual.uid;

        const consulta = query(
            referenciaAutores,
            where("autorUid", "==", uid)
        );

        const resultado = await getDocs(consulta);

        if (!sessaoValida(uid)) {
            return;
        }

        idsProprios = new Set(
            resultado.docs.map(documento => documento.id)
        );
    }


    // ========================================================
    // 12 — EXCLUSÃO
    //
    // O comentário público e a autoria privada são
    // excluídos no mesmo lote de operações.
    // ========================================================

    async function excluirComentario(comentarioId) {

        if (!sessaoValida()) {
            return;
        }

        const permitido =
            perfilAtual === "administrador" ||
            idsProprios.has(comentarioId);

        if (!permitido) {
            return;
        }

        const confirmado = window.confirm(
            "Deseja excluir este comentário?"
        );

        if (!confirmado) {
            return;
        }

        try {

            const lote = writeBatch(db);

            lote.delete(
                doc(
                    db,
                    "mural_publicacoes",
                    publicacaoId,
                    "comentarios",
                    comentarioId
                )
            );

            lote.delete(
                doc(
                    db,
                    "mural_comentarios_autores",
                    comentarioId
                )
            );

            await lote.commit();

            idsProprios.delete(comentarioId);

            await carregarComentarios(true);

            status.textContent =
                "Comentário excluído com sucesso.";

        } catch (erro) {

            console.error(
                "COJURIS — Exclusão de comentário:",
                erro
            );

            status.textContent =
                "Não foi possível excluir o comentário.";
        }
    }


    // ========================================================
    // 13 — CONSTRUIR CARD DO COMENTÁRIO
    // ========================================================

    function criarCard(documento) {

        const dados = documento.data();

        const item = elemento(
            "li",
            "cj-comentario"
        );

        const cabecalho = elemento(
            "div",
            "cj-comentario-cabecalho"
        );

        const autor = elemento(
            "strong",
            "",
            "Participante COJURIS"
        );

        const data = elemento(
            "time",
            "",
            formatarData(dados.criadoEm)
        );

        cabecalho.append(autor, data);

        const texto = elemento(
            "p",
            "cj-comentario-texto",
            dados.texto || ""
        );

        item.append(cabecalho, texto);

        const podeExcluir =
            perfilAtual === "administrador" ||
            idsProprios.has(documento.id);

        if (podeExcluir) {

            const excluir = botao(
                "Excluir comentário",
                "cj-link"
            );

            excluir.addEventListener(
                "click",
                () => excluirComentario(documento.id)
            );

            item.append(excluir);
        }

        return item;
    }


    // ========================================================
    // 14 — LISTAGEM PAGINADA
    // ========================================================

    async function carregarComentarios(reiniciar = false) {

        if (carregando || !sessaoValida()) {
            return;
        }

        carregando = true;

        carregarMais.disabled = true;

        const uid = usuarioAtual.uid;
        const versaoConsulta = versao;

        try {

            if (reiniciar) {

                ultimoDocumento = null;
                fimDaLista = false;

                lista.replaceChildren();
            }

            if (fimDaLista) {
                return;
            }

            const restricoes = [
                orderBy("criadoEm", "desc"),
                limit(TAMANHO_PAGINA)
            ];

            if (ultimoDocumento) {

                restricoes.push(
                    startAfter(ultimoDocumento)
                );
            }

            const resultado = await getDocs(
                query(
                    referenciaComentarios,
                    ...restricoes
                )
            );

            if (
                versaoConsulta !== versao ||
                !sessaoValida(uid)
            ) {
                return;
            }

            for (const documento of resultado.docs) {

                lista.append(
                    criarCard(documento)
                );
            }

            if (resultado.docs.length > 0) {

                ultimoDocumento =
                    resultado.docs[resultado.docs.length - 1];
            }

            fimDaLista =
                resultado.docs.length < TAMANHO_PAGINA;

            carregarMais.hidden = fimDaLista;

            if (
                reiniciar &&
                resultado.empty
            ) {

                status.textContent =
                    "Nenhum comentário nesta publicação.";

            } else {

                status.textContent = "";
            }

        } catch (erro) {

            console.error(
                "COJURIS — Listagem dos comentários:",
                erro
            );

            status.textContent =
                "Não foi possível carregar os comentários.";

        } finally {

            carregando = false;
            carregarMais.disabled = false;
        }
    }


    // ========================================================
    // 15 — PUBLICAÇÃO
    //
    // COOPERADO:
    // Transação com três documentos:
    // - comentário público;
    // - autoria privada;
    // - contador de participação.
    //
    // ADMINISTRADOR:
    // Lote com comentário e autoria.
    //
    // A validação definitiva ocorre nas regras.
    // ========================================================

    async function publicarComentario(evento) {

        evento.preventDefault();

        if (
            publicando ||
            !sessaoValida() ||
            !perfilPodeComentar()
        ) {
            return;
        }

        const uid = usuarioAtual.uid;

        const perfilConfirmado =
            await identificarPerfil(auth.currentUser);

        if (
            !sessaoValida(uid) ||
            perfilConfirmado !== perfilAtual
        ) {

            status.textContent =
                "Seu perfil mudou. Reabra os comentários.";

            return;
        }

        const texto = campo.value.trim();

        const maximo =
            perfilAtual === "administrador"
                ? LIMITE_ADMIN
                : LIMITE_COOPERADO;

        if (
            texto.length < 1 ||
            texto.length > maximo
        ) {

            status.textContent =
                `O comentário deve conter de 1 a ` +
                `${maximo} caracteres.`;

            return;
        }

        if (perfilAtual === "participante") {

            await consultarCota();

            if (
                !cotaConsultada ||
                cotaEsgotada() ||
                (
                    ultimoEm &&
                    Date.now() <
                    ultimoEm.getTime() + INTERVALO_MS
                )
            ) {

                status.textContent =
                    "Aguarde a liberação de sua cota.";

                return;
            }
        }

        publicando = true;
        enviar.disabled = true;

        status.textContent =
            "Publicando comentário...";

        const referenciaComentario = doc(
            referenciaComentarios
        );

        const referenciaAutor = doc(
            referenciaAutores,
            referenciaComentario.id
        );

        try {

            if (perfilAtual === "administrador") {

                const lote = writeBatch(db);

                lote.set(
                    referenciaComentario,
                    {
                        texto,
                        criadoEm: serverTimestamp()
                    }
                );

                lote.set(
                    referenciaAutor,
                    {
                        autorUid: uid,
                        publicacaoId,
                        criadoEm: serverTimestamp()
                    }
                );

                await lote.commit();

            } else {

                const referenciaLimite = doc(
                    db,
                    "limites_comentarios_mural",
                    uid
                );

                await runTransaction(
                    db,
                    async transacao => {

                        // As leituras vêm antes das escritas.
                        const resultado = await transacao.get(
                            referenciaLimite
                        );

                        const agora = Date.now();

                        let novaQuantidade = 1;
                        let novaJanela = serverTimestamp();

                        if (resultado.exists()) {

                            const dados = resultado.data();

                            const inicio =
                                dados.inicioJanela?.toMillis?.() || 0;

                            const ultimo =
                                dados.ultimoEm?.toMillis?.() || 0;

                            if (
                                agora < ultimo + INTERVALO_MS
                            ) {

                                throw new Error(
                                    "INTERVALO_COMENTARIO"
                                );
                            }

                            if (
                                agora < inicio + JANELA_MS
                            ) {

                                if (
                                    Number(dados.quantidade) >=
                                    MAXIMO_COMENTARIOS
                                ) {

                                    throw new Error(
                                        "LIMITE_COMENTARIOS"
                                    );
                                }

                                novaQuantidade =
                                    Number(dados.quantidade) + 1;

                                novaJanela = dados.inicioJanela;
                            }
                        }

                        transacao.set(
                            referenciaComentario,
                            {
                                texto,
                                criadoEm: serverTimestamp()
                            }
                        );

                        transacao.set(
                            referenciaAutor,
                            {
                                autorUid: uid,
                                publicacaoId,
                                criadoEm: serverTimestamp()
                            }
                        );

                        transacao.set(
                            referenciaLimite,
                            {
                                inicioJanela: novaJanela,
                                quantidade: novaQuantidade,
                                ultimoEm: serverTimestamp(),
                                ultimoComentarioId:
                                    referenciaComentario.id,
                                ultimaPublicacaoId:
                                    publicacaoId
                            }
                        );
                    }
                );
            }

            campo.value = "";
            atualizarCaracteres();

            idsProprios.add(referenciaComentario.id);

            await carregarComentarios(true);
            await consultarCota();

            status.textContent =
                "Comentário publicado com sucesso.";

        } catch (erro) {

            console.error(
                "COJURIS — Publicação de comentário:",
                erro
            );

            if (erro.message === "INTERVALO_COMENTARIO") {

                status.textContent =
                    "Aguarde três minutos entre comentários.";

            } else if (
                erro.message === "LIMITE_COMENTARIOS"
            ) {

                status.textContent =
                    "Limite de dois comentários atingido.";

            } else if (
                erro.code === "permission-denied"
            ) {

                status.textContent =
                    "Publicação não autorizada pelo Firebase. " +
                    "Confira seu perfil e seus limites.";

            } else {

                status.textContent =
                    "Não foi possível publicar o comentário.";
            }

            await consultarCota();

        } finally {

            publicando = false;
            atualizarDisponibilidade();
        }
    }


    // ========================================================
    // 16 — ABERTURA DO COMPONENTE
    // ========================================================

    async function abrirComentarios() {

        if (inicializando) {
            return;
        }

        inicializando = true;

        const versaoAbertura = ++versao;

        corpo.hidden = false;
        alternar.setAttribute("aria-expanded", "true");

        status.textContent =
            "Carregando comentários...";

        try {

            usuarioAtual = auth.currentUser;

            if (!usuarioAtual) {

                status.textContent =
                    "Entre na sua conta para visualizar.";

                return;
            }

            const uid = usuarioAtual.uid;

            perfilAtual = await identificarPerfil(
                usuarioAtual
            );

            if (
                versaoAbertura !== versao ||
                !sessaoValida(uid)
            ) {
                return;
            }

            const permitido = [
                "administrador",
                "participante",
                "leitor"
            ].includes(perfilAtual);

            if (!permitido) {

                status.textContent =
                    "Você ainda não possui acesso ao mural.";

                return;
            }

            formulario.hidden =
                !perfilPodeComentar();

            atualizarCaracteres();

            await carregarAutoria();

            if (versaoAbertura !== versao) {
                return;
            }

            await carregarComentarios(true);

            if (versaoAbertura !== versao) {
                return;
            }

            if (perfilPodeComentar()) {

                await consultarCota();

                // Apenas um relógio por componente aberto.
                if (!relogio) {

                    relogio = window.setInterval(
                        atualizarDisponibilidade,
                        1000
                    );
                }

            } else {

                status.textContent =
                    "Seu perfil permite apenas leitura.";
            }

        } catch (erro) {

            console.error(
                "COJURIS — Abertura dos comentários:",
                erro
            );

            status.textContent =
                "Não foi possível abrir os comentários.";

        } finally {

            inicializando = false;
        }
    }


    // ========================================================
    // 17 — FECHAMENTO
    // ========================================================

    function fecharComentarios() {

        ++versao;

        corpo.hidden = true;

        alternar.setAttribute(
            "aria-expanded",
            "false"
        );

        if (relogio) {

            window.clearInterval(relogio);
            relogio = null;
        }
    }


    // ========================================================
    // 18 — EVENTOS
    // ========================================================

    alternar.addEventListener(
        "click",
        async () => {

            if (corpo.hidden) {

                await abrirComentarios();

            } else {

                fecharComentarios();
            }
        }
    );


    carregarMais.addEventListener(
        "click",
        async () => {

            if (!fimDaLista) {
                await carregarComentarios(false);
            }
        }
    );


    formulario.addEventListener(
        "submit",
        publicarComentario
    );


    // ========================================================
    // 19 — RETORNAR COMPONENTE
    // ========================================================

    return raiz;
}
