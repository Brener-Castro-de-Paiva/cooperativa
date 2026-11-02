
/* ============================================================
   COJURIS — COMENTÁRIOS DOS COMUNICADOS

   ARQUIVO: portal/js/recursos/comentarios.js
   REPOSITÓRIO PRINCIPAL: cooperativa

   FUNCIONALIDADES:

   01 — Configurações e importações
   02 — Elementos seguros
   03 — Identificação do perfil
   04 — Permissões
   05 — Componente visual
   06 — Contador de caracteres
   07 — Controle visual da cota
   08 — Contagem regressiva
   09 — Autoria privada
   10 — Listagem paginada
   11 — Publicação com transação
   12 — Exclusão
   13 — Abertura e fechamento
   14 — Eventos

   POLÍTICA DE PARTICIPAÇÃO:

   COOPERADO:
   - Até 500 caracteres;
   - Dois comentários por janela de 24 horas;
   - Intervalo mínimo de três minutos.

   ADMINISTRADOR:
   - Até 2.000 caracteres;
   - Sem limite de quantidade;
   - Sem intervalo obrigatório.

   SEGURANÇA:
   - Comentários públicos não contêm UID;
   - Autoria armazenada separadamente;
   - Cooperados utilizam transação;
   - Exclusão conjunta dos dois registros;
   - O Firebase valida as permissões efetivas.

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
    writeBatch,
    runTransaction,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";


// ============================================================
// 02 — CONFIGURAÇÕES
// ============================================================

const TAMANHO_PAGINA = 10;

const TAMANHO_MAXIMO_COOPERADO = 500;
const TAMANHO_MAXIMO_ADMIN = 2000;

const LIMITE_DIARIO_COOPERADO = 2;

const INTERVALO_COMENTARIOS_MS = 3 * 60 * 1000;

const JANELA_DIARIA_MS = 24 * 60 * 60 * 1000;


// ============================================================
// 03 — ELEMENTOS SEGUROS
//
// textContent impede que comentários sejam
// interpretados como HTML.
// ============================================================

function elemento(tag, classe = "", texto) {

    const novo = document.createElement(tag);

    if (classe) {
        novo.className = classe;
    }

    if (texto !== undefined) {
        novo.textContent = String(texto);
    }

    return novo;
}


function criarBotao(texto, classe) {

    const botao = elemento(
        "button",
        classe,
        texto
    );

    botao.type = "button";

    return botao;
}


function formatarData(timestamp) {

    if (
        !timestamp ||
        typeof timestamp.toDate !== "function"
    ) {
        return "Agora";
    }

    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            dateStyle: "short",
            timeStyle: "short"
        }
    ).format(timestamp.toDate());
}


// ============================================================
// 04 — IDENTIFICAÇÃO DO PERFIL
// ============================================================

async function identificarPerfil(usuario) {

    if (!usuario) {
        return "sem_sessao";
    }

    const administrador = await getDoc(
        doc(db, "administradores", usuario.uid)
    );

    if (
        administrador.exists() &&
        administrador.data().ativo === true
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
// 05 — PERMISSÕES
// ============================================================

function podeComentar(perfil) {

    return (
        perfil === "administrador" ||
        perfil === "participante"
    );
}


function podeVisualizar(perfil) {

    return (
        perfil === "administrador" ||
        perfil === "participante" ||
        perfil === "leitor"
    );
}


// ============================================================
// 06 — DESTINO DO COMENTÁRIO
// ============================================================

function obterComunicadoId(alvo) {

    const resultado =
        /^comunicados\/([A-Za-z0-9_-]+)$/.exec(alvo);

    if (!resultado) {
        throw new Error(
            "Destino do comentário inválido."
        );
    }

    return resultado[1];
}


// ============================================================
// 07 — COMPONENTE REUTILIZÁVEL
//
// Chamado em comunidade.js:
// criarAreaComentarios(`comunicados/${documento.id}`)
// ============================================================

export function criarAreaComentarios(alvo) {

    const comunicadoId = obterComunicadoId(alvo);

    // --------------------------------------------------------
    // 07.1 — ESTRUTURA PRINCIPAL
    // --------------------------------------------------------

    const raiz = elemento(
        "section",
        "cj-comentarios"
    );

    const alternar = criarBotao(
        "Comentários",
        "cj-comentarios-alternar"
    );

    alternar.setAttribute(
        "aria-expanded",
        "false"
    );

    const corpo = elemento(
        "div",
        "cj-comentarios-corpo"
    );

    corpo.hidden = true;

    const lista = elemento(
        "ol",
        "cj-comentarios-lista"
    );

    const carregarMais = criarBotao(
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
    // 07.2 — FORMULÁRIO
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

    campo.name = "texto";
    campo.rows = 3;
    campo.required = true;
    campo.maxLength = TAMANHO_MAXIMO_COOPERADO;
    campo.placeholder = "Escreva seu comentário...";

    campo.setAttribute(
        "aria-label",
        "Texto do comentário"
    );

    const contadorCaracteres = elemento(
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

    const informacaoLimites = elemento(
        "p",
        "cj-politica-comentarios"
    );

    const avisoIntervalo = elemento(
        "p",
        "cj-aviso-intervalo"
    );

    avisoIntervalo.setAttribute(
        "role",
        "status"
    );

    avisoIntervalo.setAttribute(
        "aria-live",
        "off"
    );

    formulario.append(
        campo,
        contadorCaracteres,
        enviar,
        informacaoLimites,
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
    // 08 — ESTADO DO COMPONENTE
    // ========================================================

    let perfilAtual = null;
    let usuarioAtual = null;

    let ultimoDocumento = null;

    let carregado = false;
    let carregando = false;
    let inicializando = false;
    let terminouListagem = false;
    let publicando = false;

    let idsProprios = new Set();

    // Controle da frequência.
    let ultimoComentarioEm = null;
    let inicioJanela = null;
    let quantidadeNaJanela = 0;

    // Relógio visual.
    let temporizadorIntervalo = null;

    // Estado da consulta de cota.
    let limitesConsultados = false;


    // --------------------------------------------------------
    // 08.1 — REFERÊNCIAS FIRESTORE
    // --------------------------------------------------------

    const referenciaComentarios = collection(
        db,
        "comunicados",
        comunicadoId,
        "comentarios"
    );

    const referenciaAutores = collection(
        db,
        "comentarios_autores"
    );


    // --------------------------------------------------------
    // 08.2 — SESSÃO
    // --------------------------------------------------------

    function sessaoValida() {

        return (
            usuarioAtual !== null &&
            auth.currentUser !== null &&
            auth.currentUser.uid === usuarioAtual.uid
        );
    }


    // ========================================================
    // 09 — CONTADOR DE CARACTERES
    // ========================================================

    function atualizarContadorCaracteres() {

        contadorCaracteres.textContent =
            `${campo.value.length} / ` +
            `${campo.maxLength} caracteres`;
    }

    campo.addEventListener(
        "input",
        atualizarContadorCaracteres
    );


    // ========================================================
    // 10 — FORMATAÇÃO DO TEMPO
    //
    // Menos de uma hora: MM:SS
    // Uma hora ou mais: HH:MM:SS
    // ========================================================

    function formatarTempoRestante(segundos) {

        const total = Math.max(
            0,
            Math.ceil(segundos)
        );

        const horas = Math.floor(
            total / 3600
        );

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


    // ========================================================
    // 11 — VERIFICAR COTA DIÁRIA
    // ========================================================

    function janelaEstaVigente() {

        if (!inicioJanela) {
            return false;
        }

        return Date.now() < (
            inicioJanela.getTime() +
            JANELA_DIARIA_MS
        );
    }


    function cotaDiariaEsgotada() {

        return (
            janelaEstaVigente() &&
            quantidadeNaJanela >=
                LIMITE_DIARIO_COOPERADO
        );
    }


    function atualizarInformacaoCota() {

        if (perfilAtual === "administrador") {

            informacaoLimites.textContent =
                "Administração: sem limite de quantidade " +
                "ou intervalo. Até 2.000 caracteres.";

            return;
        }

        if (perfilAtual !== "participante") {
            return;
        }

        if (!limitesConsultados) {

            informacaoLimites.textContent =
                "Consultando limite de participação...";

            return;
        }

        const utilizados = janelaEstaVigente()
            ? quantidadeNaJanela
            : 0;

        const disponiveis = Math.max(
            0,
            LIMITE_DIARIO_COOPERADO - utilizados
        );

        informacaoLimites.textContent =
            `${disponiveis} de ` +
            `${LIMITE_DIARIO_COOPERADO} comentários ` +
            `disponíveis no período de 24 horas. ` +
            `Intervalo mínimo de 3 minutos.`;

        if (cotaDiariaEsgotada()) {

            const proximaJanela =
                inicioJanela.getTime() +
                JANELA_DIARIA_MS;

            informacaoLimites.textContent +=
                " Nova janela a partir de " +
                new Intl.DateTimeFormat(
                    "pt-BR",
                    {
                        dateStyle: "short",
                        timeStyle: "short"
                    }
                ).format(new Date(proximaJanela)) +
                ".";
        }
    }


    // ========================================================
    // 12 — ATUALIZAR BLOQUEIO VISUAL
    //
    // Ordem de prioridade:
    //
    // 1. Publicação em andamento.
    // 2. Limite diário atingido.
    // 3. Intervalo de três minutos.
    // 4. Publicação liberada.
    //
    // A validação real permanece no Firebase.
    // ========================================================

    function atualizarContagemRegressiva() {

        if (perfilAtual === "administrador") {

            avisoIntervalo.textContent = "";

            enviar.disabled = publicando;

            return;
        }

        if (perfilAtual !== "participante") {

            avisoIntervalo.textContent = "";

            enviar.disabled = true;

            return;
        }

        if (publicando) {

            enviar.disabled = true;

            return;
        }

        // ----------------------------------------------------
        // 12.1 — AINDA NÃO CONSULTAMOS O CONTADOR
        // ----------------------------------------------------

        if (!limitesConsultados) {

            avisoIntervalo.textContent =
                "Verificando disponibilidade...";

            enviar.disabled = true;

            return;
        }

        const agora = Date.now();


        // ----------------------------------------------------
        // 12.2 — PRIORIDADE: COTA DIÁRIA
        // ----------------------------------------------------

        if (cotaDiariaEsgotada()) {

            const proximaJanela =
                inicioJanela.getTime() +
                JANELA_DIARIA_MS;

            const segundosRestantes = Math.max(
                0,
                Math.ceil(
                    (proximaJanela - agora) / 1000
                )
            );

            avisoIntervalo.textContent =
                "Limite diário atingido. " +
                "Nova janela em " +
                formatarTempoRestante(segundosRestantes) +
                ".";

            enviar.disabled = true;

            return;
        }


        // ----------------------------------------------------
        // 12.3 — INTERVALO DE TRÊS MINUTOS
        // ----------------------------------------------------

        if (ultimoComentarioEm) {

            const proximaPublicacao =
                ultimoComentarioEm.getTime() +
                INTERVALO_COMENTARIOS_MS;

            const segundosRestantes = Math.max(
                0,
                Math.ceil(
                    (proximaPublicacao - agora) / 1000
                )
            );

            if (segundosRestantes > 0) {

                avisoIntervalo.textContent =
                    "Próxima publicação em " +
                    formatarTempoRestante(segundosRestantes);

                enviar.disabled = true;

                return;
            }
        }


        // ----------------------------------------------------
        // 12.4 — PUBLICAÇÃO DISPONÍVEL
        // ----------------------------------------------------

        avisoIntervalo.textContent =
            "Você pode publicar seu comentário.";

        enviar.disabled = false;
    }


    // ========================================================
    // 13 — CONSULTAR COTA NO FIRESTORE
    //
    // Consulta exclusiva do usuário autenticado.
    // ========================================================

    async function atualizarLimitesVisuais() {

        if (!sessaoValida()) {
            return;
        }

        if (perfilAtual === "administrador") {

            limitesConsultados = true;

            ultimoComentarioEm = null;
            inicioJanela = null;
            quantidadeNaJanela = 0;

            atualizarInformacaoCota();
            atualizarContagemRegressiva();

            return;
        }

        if (perfilAtual !== "participante") {
            return;
        }

        const uidConsultado = usuarioAtual.uid;

        limitesConsultados = false;

        atualizarInformacaoCota();
        atualizarContagemRegressiva();

        try {

            const resultado = await getDoc(
                doc(
                    db,
                    "limites_comentarios",
                    uidConsultado
                )
            );

            if (
                !sessaoValida() ||
                usuarioAtual.uid !== uidConsultado
            ) {
                return;
            }

            if (!resultado.exists()) {

                ultimoComentarioEm = null;
                inicioJanela = null;
                quantidadeNaJanela = 0;

            } else {

                const dados = resultado.data();

                ultimoComentarioEm =
                    dados.ultimoEm?.toDate?.() || null;

                inicioJanela =
                    dados.inicioJanela?.toDate?.() || null;

                quantidadeNaJanela =
                    Number(dados.quantidade) || 0;
            }

            limitesConsultados = true;

            atualizarInformacaoCota();
            atualizarContagemRegressiva();

        } catch (erro) {

            console.error(
                "COJURIS — Consulta dos limites:",
                erro
            );

            limitesConsultados = false;

            avisoIntervalo.textContent =
                "Não foi possível verificar a cota. " +
                "Tente novamente ao reabrir os comentários.";

            enviar.disabled = true;
        }
    }


    // ========================================================
    // 14 — RELÓGIO DA INTERFACE
    //
    // O relógio apenas atualiza o texto visual.
    // Não consulta o Firebase a cada segundo.
    // ========================================================

    function pararRelogio() {

        if (temporizadorIntervalo !== null) {

            clearInterval(temporizadorIntervalo);

            temporizadorIntervalo = null;
        }
    }


    function iniciarRelogio() {

        pararRelogio();

        atualizarContagemRegressiva();

        if (perfilAtual !== "participante") {
            return;
        }

        temporizadorIntervalo = setInterval(
            () => {

                // Evita continuar executando um relógio
                // de um cartão removido da página.

                if (!raiz.isConnected) {

                    pararRelogio();

                    return;
                }

                if (corpo.hidden) {

                    pararRelogio();

                    return;
                }

                atualizarInformacaoCota();
                atualizarContagemRegressiva();

            },
            1000
        );
    }


    // ========================================================
    // 15 — CARREGAR AUTORIA PRIVADA
    // ========================================================

    async function carregarAutoria() {

        if (!sessaoValida()) {

            throw new Error(
                "Sessão inválida."
            );
        }

        idsProprios = new Set();

        if (perfilAtual === "administrador") {
            return;
        }

        const consulta = query(
            referenciaAutores,
            where(
                "autorUid",
                "==",
                usuarioAtual.uid
            )
        );

        const resultado = await getDocs(
            consulta
        );

        if (!sessaoValida()) {

            throw new Error(
                "Sessão alterada."
            );
        }

        resultado.docs.forEach(documento => {

            const dados = documento.data();

            if (
                dados.comunicadoId === comunicadoId
            ) {

                idsProprios.add(
                    documento.id
                );
            }
        });
    }


    // ========================================================
    // 16 — MONTAR UM COMENTÁRIO
    // ========================================================

    function criarItemComentario(documento) {

        const dados = documento.data();

        const item = elemento(
            "li",
            "cj-comentario"
        );

        item.dataset.id = documento.id;

        const avatar = elemento(
            "span",
            "cj-avatar",
            "✦"
        );

        avatar.setAttribute(
            "aria-hidden",
            "true"
        );

        const conteudo = elemento(
            "div",
            "cj-comentario-conteudo"
        );

        const topo = elemento(
            "div",
            "cj-comentario-topo"
        );

        const autor = elemento(
            "strong",
            "",
            "Participante COJURIS"
        );

        const data = elemento(
            "time",
            "cj-data",
            formatarData(dados.criadoEm)
        );

        topo.append(
            autor,
            data
        );

        const texto = elemento(
            "p",
            "cj-comentario-texto",
            dados.texto || ""
        );

        conteudo.append(
            topo,
            texto
        );


        // ----------------------------------------------------
        // 16.1 — EXCLUSÃO AUTORIZADA
        // ----------------------------------------------------

        const podeExcluir =
            perfilAtual === "administrador" ||
            idsProprios.has(documento.id);

        if (podeExcluir) {

            const excluir = criarBotao(
                "Excluir",
                "cj-link cj-link-perigo"
            );

            excluir.addEventListener(
                "click",
                async () => {

                    await excluirComentario(
                        documento.id,
                        item,
                        excluir
                    );
                }
            );

            conteudo.appendChild(
                excluir
            );
        }

        item.append(
            avatar,
            conteudo
        );

        return item;
    }


    // ========================================================
    // 17 — LISTAGEM PAGINADA
    // ========================================================

    async function carregarComentarios(
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

        carregarMais.disabled = true;

        if (reiniciar) {

            ultimoDocumento = null;
            terminouListagem = false;

            lista.replaceChildren();
        }

        status.textContent =
            "Carregando comentários...";

        try {

            const filtros = [
                orderBy("criadoEm", "asc")
            ];

            if (ultimoDocumento) {

                filtros.push(
                    startAfter(ultimoDocumento)
                );
            }

            filtros.push(
                limit(TAMANHO_PAGINA)
            );

            const consulta = query(
                referenciaComentarios,
                ...filtros
            );

            const resultado = await getDocs(
                consulta
            );

            if (!sessaoValida()) {
                return;
            }

            resultado.docs.forEach(documento => {

                lista.appendChild(
                    criarItemComentario(documento)
                );
            });

            if (!resultado.empty) {

                ultimoDocumento =
                    resultado.docs[
                        resultado.docs.length - 1
                    ];
            }

            terminouListagem =
                resultado.size < TAMANHO_PAGINA;

            carregarMais.hidden =
                terminouListagem;

            status.textContent =
                lista.children.length === 0
                    ? "Nenhum comentário publicado."
                    : "";

        } catch (erro) {

            console.error(
                "COJURIS — Listagem:",
                erro
            );

            status.textContent =
                "Não foi possível carregar os comentários.";

        } finally {

            carregando = false;

            carregarMais.disabled =
                terminouListagem;
        }
    }


    // ========================================================
    // 18 — PUBLICAÇÃO DE COMENTÁRIO
    //
    // Administrador: writeBatch.
    // Cooperado: runTransaction.
    // ========================================================

    async function publicarComentario(evento) {

        evento.preventDefault();

        if (
            publicando ||
            enviar.disabled ||
            !sessaoValida() ||
            !podeComentar(perfilAtual)
        ) {
            return;
        }

        publicando = true;

        enviar.disabled = true;

        const texto = campo.value.trim();

        try {

            // ------------------------------------------------
            // 18.1 — REVALIDAR PERFIL
            // ------------------------------------------------

            const perfilConfirmado =
                await identificarPerfil(
                    auth.currentUser
                );

            if (
                !sessaoValida() ||
                !podeComentar(perfilConfirmado)
            ) {

                throw new Error(
                    "PERFIL_NAO_AUTORIZADO"
                );
            }

            perfilAtual = perfilConfirmado;

            const ehAdministrador =
                perfilAtual === "administrador";

            const limiteCaracteres =
                ehAdministrador
                    ? TAMANHO_MAXIMO_ADMIN
                    : TAMANHO_MAXIMO_COOPERADO;

            campo.maxLength =
                limiteCaracteres;

            atualizarContadorCaracteres();


            // ------------------------------------------------
            // 18.2 — VALIDAR TEXTO
            // ------------------------------------------------

            if (
                texto.length < 1 ||
                texto.length > limiteCaracteres
            ) {

                status.textContent =
                    "O comentário deve conter entre 1 e " +
                    `${limiteCaracteres} caracteres.`;

                return;
            }


            // ------------------------------------------------
            // 18.3 — REFERÊNCIAS DE GRAVAÇÃO
            // ------------------------------------------------

            status.textContent =
                "Publicando comentário...";

            const uid = usuarioAtual.uid;

            const novoComentario = doc(
                referenciaComentarios
            );

            const registroAutor = doc(
                referenciaAutores,
                novoComentario.id
            );


            // ------------------------------------------------
            // 18.4 — ADMINISTRADOR: SEM CONTADOR
            // ------------------------------------------------

            if (ehAdministrador) {

                const lote = writeBatch(db);

                lote.set(
                    novoComentario,
                    {
                        texto,
                        criadoEm: serverTimestamp()
                    }
                );

                lote.set(
                    registroAutor,
                    {
                        autorUid: uid,
                        comunicadoId,
                        criadoEm: serverTimestamp()
                    }
                );

                await lote.commit();

            } else {

                // --------------------------------------------
                // 18.5 — COOPERADO: TRANSAÇÃO
                // --------------------------------------------

                const referenciaLimite = doc(
                    db,
                    "limites_comentarios",
                    uid
                );

                await runTransaction(
                    db,
                    async transacao => {

                        // Leitura obrigatória antes de
                        // qualquer escrita.

                        const documentoLimite =
                            await transacao.get(
                                referenciaLimite
                            );

                        const agora = Date.now();

                        let quantidadeAnterior = 0;
                        let inicioAnterior = null;
                        let ultimoAnterior = null;


                        if (documentoLimite.exists()) {

                            const dados =
                                documentoLimite.data();

                            quantidadeAnterior =
                                dados.quantidade || 0;

                            inicioAnterior =
                                dados.inicioJanela?.toDate?.()
                                || null;

                            ultimoAnterior =
                                dados.ultimoEm?.toDate?.()
                                || null;
                        }


                        // ------------------------------------
                        // INTERVALO ENTRE PUBLICAÇÕES
                        // ------------------------------------

                        if (ultimoAnterior) {

                            const decorrido =
                                agora -
                                ultimoAnterior.getTime();

                            if (
                                decorrido <
                                INTERVALO_COMENTARIOS_MS
                            ) {

                                const restantes = Math.ceil(
                                    (
                                        INTERVALO_COMENTARIOS_MS -
                                        decorrido
                                    ) / 1000
                                );

                                throw new Error(
                                    "INTERVALO:" +
                                    restantes
                                );
                            }
                        }


                        // ------------------------------------
                        // JANELA DE 24 HORAS
                        // ------------------------------------

                        const janelaExpirada =
                            !inicioAnterior ||
                            (
                                agora -
                                inicioAnterior.getTime()
                            ) >= JANELA_DIARIA_MS;

                        const quantidadeNova =
                            janelaExpirada
                                ? 1
                                : quantidadeAnterior + 1;


                        // ------------------------------------
                        // COTA DIÁRIA
                        // ------------------------------------

                        if (
                            quantidadeNova >
                            LIMITE_DIARIO_COOPERADO
                        ) {

                            throw new Error(
                                "LIMITE_DIARIO"
                            );
                        }


                        // ------------------------------------
                        // GRAVAR COMENTÁRIO PÚBLICO
                        // ------------------------------------

                        transacao.set(
                            novoComentario,
                            {
                                texto,
                                criadoEm: serverTimestamp()
                            }
                        );


                        // ------------------------------------
                        // GRAVAR AUTORIA PRIVADA
                        // ------------------------------------

                        transacao.set(
                            registroAutor,
                            {
                                autorUid: uid,
                                comunicadoId,
                                criadoEm: serverTimestamp()
                            }
                        );


                        // ------------------------------------
                        // ATUALIZAR CONTADOR INDIVIDUAL
                        // ------------------------------------

                        transacao.set(
                            referenciaLimite,
                            {
                                inicioJanela:
                                    janelaExpirada
                                        ? serverTimestamp()
                                        : documentoLimite
                                            .data()
                                            .inicioJanela,

                                quantidade:
                                    quantidadeNova,

                                ultimoEm:
                                    serverTimestamp(),

                                ultimoComentarioId:
                                    novoComentario.id,

                                ultimoComunicadoId:
                                    comunicadoId
                            }
                        );
                    }
                );
            }


            // ------------------------------------------------
            // 18.6 — PUBLICAÇÃO CONCLUÍDA
            // ------------------------------------------------

            if (!sessaoValida()) {
                return;
            }

            campo.value = "";

            atualizarContadorCaracteres();

            idsProprios.add(
                novoComentario.id
            );

            await carregarComentarios(true);

            status.textContent =
                "Comentário publicado com sucesso.";

            // Consulta novamente os registros efetivos
            // de cota depois da publicação.

            await atualizarLimitesVisuais();

            if (!corpo.hidden) {
                iniciarRelogio();
            }

        } catch (erro) {

            console.error(
                "COJURIS — Publicação:",
                erro
            );


            // ------------------------------------------------
            // 18.7 — MENSAGENS DE ERRO
            // ------------------------------------------------

            if (
                erro.message === "LIMITE_DIARIO"
            ) {

                status.textContent =
                    "Você atingiu o limite de dois " +
                    "comentários em 24 horas.";

            } else if (
                erro.message?.startsWith(
                    "INTERVALO:"
                )
            ) {

                const segundos = Number(
                    erro.message.split(":")[1]
                );

                status.textContent =
                    "Aguarde " +
                    formatarTempoRestante(segundos) +
                    " para publicar novamente.";

            } else if (
                erro.message ===
                "PERFIL_NAO_AUTORIZADO"
            ) {

                status.textContent =
                    "Sua conta não está autorizada " +
                    "a publicar comentários.";

            } else if (
                erro.code === "permission-denied"
            ) {

                status.textContent =
                    "O Firebase não autorizou a " +
                    "publicação. Verifique suas " +
                    "permissões e limites.";

            } else if (
                erro.code === "unavailable"
            ) {

                status.textContent =
                    "Não foi possível conectar ao Firebase.";

            } else {

                status.textContent =
                    "Não foi possível publicar o comentário.";
            }

        } finally {

            publicando = false;

            // Não liberamos o botão automaticamente.
            // O estado é recalculado pela cota e
            // pelo intervalo efetivamente registrados.

            atualizarInformacaoCota();
            atualizarContagemRegressiva();
        }
    }


    // ========================================================
    // 19 — EXCLUSÃO DE COMENTÁRIOS
    //
    // A exclusão não devolve a cota utilizada.
    // ========================================================

    async function excluirComentario(
        comentarioId,
        item,
        botaoExcluir
    ) {

        if (!sessaoValida()) {
            return;
        }

        if (
            perfilAtual !== "administrador" &&
            !idsProprios.has(comentarioId)
        ) {
            return;
        }

        const confirmado = window.confirm(
            "Deseja excluir este comentário?"
        );

        if (!confirmado) {
            return;
        }

        botaoExcluir.disabled = true;

        try {

            const lote = writeBatch(db);

            lote.delete(
                doc(
                    referenciaComentarios,
                    comentarioId
                )
            );

            lote.delete(
                doc(
                    referenciaAutores,
                    comentarioId
                )
            );

            await lote.commit();

            if (!sessaoValida()) {
                return;
            }

            idsProprios.delete(comentarioId);

            item.remove();

            status.textContent =
                "Comentário excluído.";

        } catch (erro) {

            console.error(
                "COJURIS — Exclusão:",
                erro
            );

            status.textContent =
                "Não foi possível excluir o comentário.";

            botaoExcluir.disabled = false;
        }
    }


    // ========================================================
    // 20 — ABERTURA E FECHAMENTO
    // ========================================================

    alternar.addEventListener(
        "click",
        async () => {

            const abrir = corpo.hidden;

            corpo.hidden = !abrir;

            alternar.setAttribute(
                "aria-expanded",
                String(abrir)
            );


            // ------------------------------------------------
            // 20.1 — FECHAR COMENTÁRIOS
            // ------------------------------------------------

            if (!abrir) {

                pararRelogio();

                return;
            }


            // ------------------------------------------------
            // 20.2 — REABRIR
            // ------------------------------------------------

            if (carregado) {

                await atualizarLimitesVisuais();

                if (!corpo.hidden) {
                    iniciarRelogio();
                }

                return;
            }


            // ------------------------------------------------
            // 20.3 — PRIMEIRA ABERTURA
            // ------------------------------------------------

            if (inicializando) {
                return;
            }

            inicializando = true;

            alternar.disabled = true;

            try {

                usuarioAtual = auth.currentUser;

                if (!usuarioAtual) {

                    throw new Error(
                        "Usuário não autenticado."
                    );
                }

                perfilAtual = await identificarPerfil(
                    usuarioAtual
                );


                // --------------------------------------------
                // VERIFICAR AUTORIZAÇÃO
                // --------------------------------------------

                if (
                    !sessaoValida() ||
                    !podeVisualizar(perfilAtual)
                ) {

                    throw new Error(
                        "Acesso não autorizado."
                    );
                }


                // --------------------------------------------
                // LIMITES PELO PERFIL
                // --------------------------------------------

                campo.maxLength =
                    perfilAtual === "administrador"
                        ? TAMANHO_MAXIMO_ADMIN
                        : TAMANHO_MAXIMO_COOPERADO;

                atualizarContadorCaracteres();


                // --------------------------------------------
                // FORMULÁRIO
                // --------------------------------------------

                formulario.hidden =
                    !podeComentar(perfilAtual);


                // --------------------------------------------
                // AUTORIA E COMENTÁRIOS
                // --------------------------------------------

                await carregarAutoria();

                await carregarComentarios(true);


                // --------------------------------------------
                // CONTROLE VISUAL DE PARTICIPAÇÃO
                // --------------------------------------------

                if (podeComentar(perfilAtual)) {

                    await atualizarLimitesVisuais();
                }

                carregado = true;

                if (!corpo.hidden) {
                    iniciarRelogio();
                }

            } catch (erro) {

                console.error(
                    "COJURIS — Inicialização:",
                    erro
                );

                status.textContent =
                    "Não foi possível abrir os comentários.";

                carregado = false;

            } finally {

                inicializando = false;

                alternar.disabled = false;
            }
        }
    );


    // ========================================================
    // 21 — CARREGAR MAIS COMENTÁRIOS
    // ========================================================

    carregarMais.addEventListener(
        "click",
        async () => {

            if (!terminouListagem) {

                await carregarComentarios(false);
            }
        }
    );


    // ========================================================
    // 22 — ENVIO DO FORMULÁRIO
    // ========================================================

    formulario.addEventListener(
        "submit",
        publicarComentario
    );


    // ========================================================
    // 23 — RETORNAR COMPONENTE
    // ========================================================

    return raiz;
}
