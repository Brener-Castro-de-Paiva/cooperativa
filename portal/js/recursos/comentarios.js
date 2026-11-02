
/* ============================================================
   COJURIS — COMENTÁRIOS NOS COMUNICADOS

   ARQUIVO: portal/js/recursos/comentarios.js

   REPOSITÓRIO PRINCIPAL: cooperativa

   Referência arquitetural: cooperativa2

   FUNCIONALIDADES:
   01 — Importações
   02 — Elementos seguros
   03 — Perfil e permissões
   04 — Componente de comentários
   05 — Listagem paginada
   06 — Publicação
   07 — Exclusão
   08 — Abertura e fechamento

   PRIVACIDADE:
   - Não exibe nomes ou emails dos cooperados.
   - Não grava identidade no comentário público.
   - Mantém a autoria em coleção separada.
   - Permite ao titular excluir seus comentários.
   - Permite moderação pela administração.

   REQUISITO:
   Regras de segurança específicas no Firestore.
   ============================================================ */


// ============================================================
// 01 — IMPORTAÇÕES
// ============================================================

import { auth, db } from "../firebase-config.js";

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
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";


// ============================================================
// 02 — CONFIGURAÇÕES
// ============================================================

const TAMANHO_PAGINA = 10;

const TAMANHO_MAXIMO_TEXTO = 2000;


// ============================================================
// 03 — CRIAÇÃO SEGURA DOS ELEMENTOS
//
// Utilizamos textContent para impedir que
// comentários sejam interpretados como HTML.
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

    const novo = elemento(
        "button",
        classe,
        texto
    );

    novo.type = "button";

    return novo;
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
//
// Utiliza as mesmas coleções e condições
// existentes no restante da COJURIS.
// ============================================================

async function identificarPerfil(usuario) {

    if (!usuario) {
        return "sem_sessao";
    }

    // Consulta somente o documento administrativo
    // correspondente ao usuário autenticado.

    const administrador = await getDoc(
        doc(
            db,
            "administradores",
            usuario.uid
        )
    );

    if (
        administrador.exists() &&
        administrador.data().ativo === true
    ) {

        return "administrador";
    }

    // Consulta apenas o próprio cadastro.

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
// 05 — CONTROLE DAS PERMISSÕES
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
// 06 — VALIDAÇÃO DO DESTINO
//
// Nesta etapa, os comentários serão vinculados
// exclusivamente aos comunicados oficiais.
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
// Esta função é importada por comunidade.js:
//
// criarAreaComentarios(`comunicados/${documento.id}`)
//
// Cada comunicado recebe sua própria instância.
// ============================================================

export function criarAreaComentarios(alvo) {

    const comunicadoId = obterComunicadoId(alvo);

    // --------------------------------------------------------
    // 07.1 — ELEMENTOS PRINCIPAIS
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

    status.setAttribute(
        "role",
        "status"
    );

    status.setAttribute(
        "aria-live",
        "polite"
    );

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

    campo.maxLength = TAMANHO_MAXIMO_TEXTO;

    campo.required = true;

    campo.placeholder =
        "Escreva seu comentário...";

    campo.setAttribute(
        "aria-label",
        "Texto do comentário"
    );

    const enviar = elemento(
        "button",
        "cj-botao",
        "Publicar comentário"
    );

    enviar.type = "submit";

    formulario.append(
        campo,
        enviar
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

    // --------------------------------------------------------
    // 07.3 — ESTADO INDIVIDUAL
    // --------------------------------------------------------

    let perfilAtual = null;

    let usuarioAtual = null;

    let ultimoDocumento = null;

    let carregado = false;

    let carregando = false;

    let inicializando = false;

    let terminouListagem = false;

    let publicando = false;

    let idsProprios = new Set();

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
    // 07.4 — VERIFICAR SESSÃO
    // --------------------------------------------------------

    function sessaoValida() {

        return (
            usuarioAtual !== null &&
            auth.currentUser !== null &&
            auth.currentUser.uid === usuarioAtual.uid
        );
    }

    // --------------------------------------------------------
    // 07.5 — CARREGAR IDENTIFICAÇÃO DA AUTORIA
    //
    // Administradores podem moderar comentários.
    //
    // Participantes consultam somente registros
    // de autoria correspondentes ao próprio UID.
    // --------------------------------------------------------

    async function carregarAutoria() {

        if (!sessaoValida()) {
            throw new Error("Sessão inválida.");
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

        const resultado = await getDocs(consulta);

        if (!sessaoValida()) {
            throw new Error("Sessão alterada.");
        }

        resultado.docs.forEach(documento => {

            const dados = documento.data();

            if (
                dados.comunicadoId === comunicadoId
            ) {

                idsProprios.add(documento.id);
            }
        });
    }

    // --------------------------------------------------------
    // 08 — MONTAGEM DE UM COMENTÁRIO
    //
    // Nenhuma identidade pessoal é exibida.
    // --------------------------------------------------------

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
        // 08.1 — CONTROLE DE EXCLUSÃO
        //
        // O administrador pode excluir qualquer comentário.
        //
        // O participante só pode excluir comentário
        // cuja autoria privada lhe pertença.
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

            conteudo.appendChild(excluir);
        }

        item.append(
            avatar,
            conteudo
        );

        return item;
    }

    // --------------------------------------------------------
    // 09 — LISTAGEM PAGINADA
    // --------------------------------------------------------

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
                "COJURIS — Listagem de comentários:",
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

    // --------------------------------------------------------
    // 10 — PUBLICAÇÃO
    //
    // Usa writeBatch para criar simultaneamente:
    //
    // - comentário público;
    // - registro privado de autoria.
    //
    // Nenhum nome ou email será gravado no comentário.
    // --------------------------------------------------------

    async function publicarComentario(evento) {

        evento.preventDefault();

        if (
            publicando ||
            !sessaoValida() ||
            !podeComentar(perfilAtual)
        ) {

            return;
        }

        const texto = campo.value.trim();

        if (
            texto.length < 1 ||
            texto.length > TAMANHO_MAXIMO_TEXTO
        ) {

            status.textContent =
                "O comentário deve conter de 1 " +
                "a 2.000 caracteres.";

            return;
        }

        publicando = true;

        enviar.disabled = true;

        status.textContent =
            "Publicando comentário...";

        try {

            const novoComentario = doc(
                referenciaComentarios
            );

            const registroAutor = doc(
                referenciaAutores,
                novoComentario.id
            );

            const lote = writeBatch(db);

            // Registro visível à comunidade.

            lote.set(
                novoComentario,
                {
                    texto: texto,
                    criadoEm: serverTimestamp()
                }
            );

            // Registro privado de autoria.

            lote.set(
                registroAutor,
                {
                    autorUid: usuarioAtual.uid,
                    comunicadoId: comunicadoId,
                    criadoEm: serverTimestamp()
                }
            );

            await lote.commit();

            if (!sessaoValida()) {
                return;
            }

            campo.value = "";

            idsProprios.add(
                novoComentario.id
            );

            await carregarComentarios(true);

            status.textContent =
                "Comentário publicado com sucesso.";

        } catch (erro) {

            console.error(
                "COJURIS — Publicação de comentário:",
                erro
            );

            status.textContent =
                "Não foi possível publicar o comentário. " +
                "Verifique suas permissões.";

        } finally {

            publicando = false;

            enviar.disabled = false;
        }
    }

    // --------------------------------------------------------
    // 11 — EXCLUSÃO
    //
    // Exclui os dois documentos no mesmo lote.
    //
    // As regras do Firestore validam a autorização.
    // --------------------------------------------------------

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

            idsProprios.delete(
                comentarioId
            );

            item.remove();

            status.textContent =
                "Comentário excluído.";

        } catch (erro) {

            console.error(
                "COJURIS — Exclusão de comentário:",
                erro
            );

            status.textContent =
                "Não foi possível excluir o comentário.";

            botaoExcluir.disabled = false;
        }
    }

    // --------------------------------------------------------
    // 12 — ABERTURA E FECHAMENTO DOS COMENTÁRIOS
    //
    // Carrega os comentários somente quando
    // o usuário abre a seção pela primeira vez.
    // --------------------------------------------------------

    alternar.addEventListener(
        "click",
        async () => {

            const abrir = corpo.hidden;

            corpo.hidden = !abrir;

            alternar.setAttribute(
                "aria-expanded",
                String(abrir)
            );

            if (
                !abrir ||
                carregado ||
                inicializando
            ) {

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

                if (
                    !sessaoValida() ||
                    !podeVisualizar(perfilAtual)
                ) {

                    throw new Error(
                        "Acesso não autorizado."
                    );
                }

                formulario.hidden =
                    !podeComentar(perfilAtual);

                await carregarAutoria();

                await carregarComentarios(true);

                carregado = true;

            } catch (erro) {

                console.error(
                    "COJURIS — Inicialização de comentários:",
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

    // --------------------------------------------------------
    // 13 — CARREGAR MAIS
    // --------------------------------------------------------

    carregarMais.addEventListener(
        "click",
        async () => {

            if (!terminouListagem) {

                await carregarComentarios(false);
            }
        }
    );

    // --------------------------------------------------------
    // 14 — ENVIO DO FORMULÁRIO
    // --------------------------------------------------------

    formulario.addEventListener(
        "submit",
        publicarComentario
    );

    return raiz;
}
