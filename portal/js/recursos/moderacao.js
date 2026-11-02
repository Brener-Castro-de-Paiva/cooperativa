
/* ============================================================
   COJURIS — MODERAÇÃO ADMINISTRATIVA DE COMENTÁRIOS

   ARQUIVO: portal/js/recursos/moderacao.js
   REPOSITÓRIO: cooperativa

   FUNCIONALIDADES:

   01 — Importações
   02 — Elementos da interface
   03 — Estado da aplicação
   04 — Funções auxiliares
   05 — Verificação administrativa
   06 — Identificação privada dos autores
   07 — Construção dos cards
   08 — Listagem de todos os comentários
   09 — Exclusão administrativa
   10 — Autenticação
   11 — Eventos

   CARACTERÍSTICAS:

   - Sem limite artificial de comentários para leitura.
   - A administração pode visualizar todo o histórico.
   - Mantém a separação entre comentário e autoria.
   - Não expõe identificação na comunidade.
   - Mantém a exclusão em lote.
   - Compatível com portal/css/admin.css.

   IMPORTANTE:

   Este módulo é exclusivo da administração.
   Os limites de publicação dos cooperados
   pertencem ao módulo comentarios.js e às
   regras de segurança do Firebase.

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
    orderBy,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";


// ============================================================
// 02 — ELEMENTOS HTML
// ============================================================

const secao = document.getElementById(
    "moderacao-comentarios"
);

const lista = document.getElementById(
    "moderacao-lista"
);

const mensagem = document.getElementById(
    "moderacao-mensagem"
);

const btnAtualizar = document.getElementById(
    "moderacao-atualizar"
);


// ============================================================
// 03 — ESTADO DA APLICAÇÃO
//
// Não utilizamos mais LIMITE_COMUNICADOS
// nem LIMITE_COMENTARIOS.
//
// Todas as publicações existentes poderão ser
// consultadas pela administração.
// ============================================================

let usuarioAdmin = null;

let acessoAutorizado = false;

let carregando = false;

let versaoSessao = 0;


// ============================================================
// 04 — FUNÇÕES AUXILIARES
//
// Utilizamos textContent para impedir que
// conteúdo de comentários seja interpretado
// como HTML ou JavaScript.
// ============================================================

function elemento(
    tag,
    classe = "",
    texto
) {

    const novo = document.createElement(tag);

    if (classe) {
        novo.className = classe;
    }

    if (texto !== undefined) {
        novo.textContent = String(texto);
    }

    return novo;
}


// ============================================================
// 04.1 — FORMATAÇÃO DE DATAS
// ============================================================

function formatarData(timestamp) {

    const data = timestamp?.toDate?.();

    if (!data) {
        return "Data indisponível";
    }

    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            dateStyle: "short",
            timeStyle: "short"
        }
    ).format(data);
}


// ============================================================
// 04.2 — MENSAGENS
// ============================================================

function informar(texto) {

    mensagem.textContent = texto;
}


// ============================================================
// 05 — AUTORIZAÇÃO ADMINISTRATIVA
//
// Consulta:
// administradores/{uid}
//
// O administrador precisa estar ativo.
//
// As regras do Firestore continuam sendo
// responsáveis pela autorização efetiva.
// ============================================================

async function verificarAdministrador(usuario) {

    if (!usuario) {
        return false;
    }

    const referencia = doc(
        db,
        "administradores",
        usuario.uid
    );

    const resultado = await getDoc(
        referencia
    );

    return (
        resultado.exists() &&
        resultado.data().ativo === true
    );
}


// ============================================================
// 05.1 — VALIDAÇÃO DE SESSÃO
// ============================================================

function sessaoValida() {

    return (
        acessoAutorizado &&
        usuarioAdmin !== null &&
        auth.currentUser?.uid === usuarioAdmin.uid
    );
}


// ============================================================
// 06 — IDENTIFICAÇÃO PRIVADA DO AUTOR
//
// Consulta a coleção:
// comentarios_autores/{comentarioId}
//
// A identificação continua separada
// do comentário público.
//
// Também consulta o cadastro do interessado,
// caso exista.
// ============================================================

async function obterAutoria(comentarioId) {

    const referenciaAutor = doc(
        db,
        "comentarios_autores",
        comentarioId
    );

    const resultadoAutor = await getDoc(
        referenciaAutor
    );

    if (!resultadoAutor.exists()) {

        return {
            uid: "",
            nome: "Registro de autoria não encontrado",
            email: ""
        };
    }

    const dadosAutor = resultadoAutor.data();

    const uid = dadosAutor.autorUid || "";

    if (!uid) {

        return {
            uid: "",
            nome: "Autoria incompleta",
            email: ""
        };
    }

    // --------------------------------------------------------
    // CONSULTAR DADOS CADASTRAIS
    //
    // Administradores também podem comentar,
    // mesmo sem cadastro em interessados.
    // --------------------------------------------------------

    const referenciaInteressado = doc(
        db,
        "interessados",
        uid
    );

    const resultadoInteressado = await getDoc(
        referenciaInteressado
    );

    if (!resultadoInteressado.exists()) {

        return {
            uid,
            nome: "Administrador ou cadastro não localizado",
            email: ""
        };
    }

    const cadastro = resultadoInteressado.data();

    return {
        uid,
        nome: cadastro.nome || "Nome não informado",
        email: cadastro.email || ""
    };
}


// ============================================================
// 07 — CONSTRUÇÃO DOS CARDS
//
// Estrutura:
//
// Card principal
//   ├── Cabeçalho do comunicado
//   ├── Quadro do comentário
//   ├── Identificação administrativa
//   └── Botão de exclusão
//
// Mantemos todas as classes utilizadas
// pelo admin.css.
// ============================================================

function criarCartao({

    comentarioId,
    comunicadoId,
    tituloComunicado,
    texto,
    criadoEm,
    autoria

}) {

    // --------------------------------------------------------
    // 07.1 — CARD PRINCIPAL
    // --------------------------------------------------------

    const cartao = elemento(
        "article",
        "moderacao-card"
    );


    // --------------------------------------------------------
    // 07.2 — CABEÇALHO
    // --------------------------------------------------------

    const topo = elemento(
        "div",
        "moderacao-card-topo"
    );

    const identificacao = elemento(
        "div",
        "moderacao-card-identificacao"
    );

    const categoria = elemento(
        "span",
        "moderacao-categoria",
        "Comentário"
    );

    const titulo = elemento(
        "h3",
        "",
        tituloComunicado
    );

    identificacao.append(
        categoria,
        titulo
    );

    const data = elemento(
        "time",
        "moderacao-data",
        formatarData(criadoEm)
    );

    if (criadoEm?.toDate) {

        data.dateTime =
            criadoEm.toDate().toISOString();
    }

    topo.append(
        identificacao,
        data
    );


    // --------------------------------------------------------
    // 07.3 — QUADRO DO COMENTÁRIO
    // --------------------------------------------------------

    const quadroComentario = elemento(
        "section",
        "moderacao-comentario-box"
    );

    const rotuloComentario = elemento(
        "span",
        "moderacao-subtitulo",
        "Conteúdo do comentário"
    );

    const quadroTexto = elemento(
        "div",
        "moderacao-texto-card"
    );

    const textoComentario = elemento(
        "p",
        "moderacao-texto",
        texto
    );

    quadroTexto.appendChild(
        textoComentario
    );

    quadroComentario.append(
        rotuloComentario,
        quadroTexto
    );


    // --------------------------------------------------------
    // 07.4 — IDENTIFICAÇÃO ADMINISTRATIVA
    //
    // Informações reservadas ao administrador.
    // --------------------------------------------------------

    const blocoAutor = elemento(
        "section",
        "moderacao-autor"
    );

    const tituloAutor = elemento(
        "strong",
        "moderacao-autor-titulo",
        "Identificação administrativa"
    );

    blocoAutor.appendChild(
        tituloAutor
    );


    // NOME

    const linhaNome = elemento(
        "p",
        "moderacao-autor-linha"
    );

    linhaNome.append(

        elemento(
            "span",
            "moderacao-autor-rotulo",
            "Nome:"
        ),

        elemento(
            "span",
            "",
            autoria.nome
        )
    );

    blocoAutor.appendChild(
        linhaNome
    );


    // E-MAIL

    if (autoria.email) {

        const linhaEmail = elemento(
            "p",
            "moderacao-autor-linha"
        );

        linhaEmail.append(

            elemento(
                "span",
                "moderacao-autor-rotulo",
                "E-mail:"
            ),

            elemento(
                "span",
                "",
                autoria.email
            )
        );

        blocoAutor.appendChild(
            linhaEmail
        );
    }


    // UID

    if (autoria.uid) {

        const linhaUid = elemento(
            "p",
            "moderacao-autor-linha moderacao-uid"
        );

        linhaUid.append(

            elemento(
                "span",
                "moderacao-autor-rotulo",
                "UID:"
            ),

            elemento(
                "span",
                "",
                autoria.uid
            )
        );

        blocoAutor.appendChild(
            linhaUid
        );
    }


    // --------------------------------------------------------
    // 07.5 — AÇÕES
    // --------------------------------------------------------

    const acoes = elemento(
        "div",
        "moderacao-acoes"
    );

    const excluir = elemento(
        "button",
        "moderacao-excluir"
    );

    excluir.type = "button";

    excluir.setAttribute(
        "aria-label",
        "Excluir comentário do comunicado " +
        tituloComunicado
    );

    const icone = elemento(
        "span",
        "moderacao-excluir-icone",
        "▤"
    );

    icone.setAttribute(
        "aria-hidden",
        "true"
    );

    const textoExcluir = elemento(
        "span",
        "",
        "Excluir comentário"
    );

    excluir.append(
        icone,
        textoExcluir
    );


    // Mantém o procedimento original de
    // exclusão com quatro argumentos.

    excluir.addEventListener(
        "click",
        async () => {

            await excluirComentario(
                comunicadoId,
                comentarioId,
                cartao,
                excluir
            );
        }
    );

    acoes.appendChild(
        excluir
    );


    // --------------------------------------------------------
    // 07.6 — MONTAGEM FINAL
    // --------------------------------------------------------

    cartao.append(
        topo,
        quadroComentario,
        blocoAutor,
        acoes
    );

    return cartao;
}


// ============================================================
// 08 — CARREGAMENTO DA MODERAÇÃO
//
// CONSULTA SEM LIMITE ARTIFICIAL:
//
// 1. Busca todos os comunicados.
// 2. Busca todos os comentários de cada comunicado.
// 3. Consulta a autoria privada.
// 4. Monta o card administrativo.
//
// A rolagem visual é controlada pelo admin.css.
// ============================================================

async function carregarModeracao() {

    if (
        !sessaoValida() ||
        carregando
    ) {

        return;
    }

    carregando = true;

    btnAtualizar.disabled = true;

    const sessaoAtual = versaoSessao;

    lista.replaceChildren();

    informar(
        "Consultando comentários..."
    );

    try {

        // ----------------------------------------------------
        // 08.1 — CONSULTAR TODOS OS COMUNICADOS
        //
        // A consulta não utiliza limit().
        // ----------------------------------------------------

        const comunicados = await getDocs(
            query(
                collection(
                    db,
                    "comunicados"
                ),
                orderBy(
                    "publicadoEm",
                    "desc"
                )
            )
        );

        if (
            sessaoAtual !== versaoSessao ||
            !sessaoValida()
        ) {

            return;
        }

        let quantidade = 0;


        // ----------------------------------------------------
        // 08.2 — PERCORRER OS COMUNICADOS
        // ----------------------------------------------------

        for (const comunicado of comunicados.docs) {

            if (
                sessaoAtual !== versaoSessao ||
                !sessaoValida()
            ) {

                return;
            }

            const tituloComunicado =
                comunicado.data().titulo ||
                "Comunicado sem título";


            // ------------------------------------------------
            // 08.3 — CONSULTAR TODOS OS COMENTÁRIOS
            //
            // Não utilizamos limit().
            // ------------------------------------------------

            const comentarios = await getDocs(
                query(
                    collection(
                        db,
                        "comunicados",
                        comunicado.id,
                        "comentarios"
                    ),
                    orderBy(
                        "criadoEm",
                        "desc"
                    )
                )
            );


            // ------------------------------------------------
            // 08.4 — IDENTIFICAR CADA AUTOR
            // ------------------------------------------------

            for (const comentario of comentarios.docs) {

                if (
                    sessaoAtual !== versaoSessao ||
                    !sessaoValida()
                ) {

                    return;
                }

                const dados = comentario.data();

                const autoria = await obterAutoria(
                    comentario.id
                );

                if (
                    sessaoAtual !== versaoSessao ||
                    !sessaoValida()
                ) {

                    return;
                }


                // --------------------------------------------
                // 08.5 — CONSTRUIR O CARD
                // --------------------------------------------

                const cartao = criarCartao({

                    comentarioId: comentario.id,

                    comunicadoId: comunicado.id,

                    tituloComunicado,

                    texto: dados.texto || "",

                    criadoEm: dados.criadoEm,

                    autoria

                });

                lista.appendChild(
                    cartao
                );

                quantidade++;
            }
        }


        // ----------------------------------------------------
        // 08.6 — RESULTADO DA CONSULTA
        // ----------------------------------------------------

        if (quantidade === 0) {

            informar(
                "Nenhum comentário encontrado."
            );

        } else {

            informar(
                `${quantidade} comentário(s) carregado(s).`
            );
        }

    } catch (erro) {

        console.error(
            "COJURIS — Moderação:",
            erro.code || erro.message
        );

        informar(
            "Não foi possível carregar os comentários. " +
            "Verifique as permissões e a conexão."
        );

    } finally {

        if (sessaoAtual === versaoSessao) {

            carregando = false;

            btnAtualizar.disabled = false;
        }
    }
}


// ============================================================
// 09 — EXCLUSÃO ADMINISTRATIVA
//
// Mantém a exclusão conjunta:
//
// 1. Comentário público;
// 2. Registro privado de autoria.
//
// A operação ocorre em um único lote.
// ============================================================

async function excluirComentario(
    comunicadoId,
    comentarioId,
    cartao,
    botao
) {

    if (!sessaoValida()) {
        return;
    }

    // --------------------------------------------------------
    // 09.1 — CONFIRMAÇÃO FORTE
    // --------------------------------------------------------

    const resposta = window.prompt(
        "ATENÇÃO: exclusão de comentário.\n\n" +
        "Esta operação removerá definitivamente " +
        "o comentário e seu registro de autoria.\n\n" +
        "Digite EXCLUIR para confirmar:"
    );

    if (resposta !== "EXCLUIR") {
        return;
    }

    const uidAdmin = usuarioAdmin.uid;

    const sessaoAtual = versaoSessao;

    botao.disabled = true;

    informar(
        "Excluindo comentário..."
    );

    try {

        // ----------------------------------------------------
        // 09.2 — VERIFICAR AUTORIZAÇÃO
        // ----------------------------------------------------

        const usuario = auth.currentUser;

        if (
            !usuario ||
            usuario.uid !== uidAdmin ||
            !(await verificarAdministrador(usuario))
        ) {

            throw new Error(
                "Autorização administrativa inválida."
            );
        }

        if (
            sessaoAtual !== versaoSessao ||
            !sessaoValida()
        ) {

            return;
        }


        // ----------------------------------------------------
        // 09.3 — EXCLUSÃO NO FIRESTORE
        // ----------------------------------------------------

        const lote = writeBatch(db);

        lote.delete(
            doc(
                db,
                "comunicados",
                comunicadoId,
                "comentarios",
                comentarioId
            )
        );

        lote.delete(
            doc(
                db,
                "comentarios_autores",
                comentarioId
            )
        );

        await lote.commit();


        // ----------------------------------------------------
        // 09.4 — ATUALIZAÇÃO VISUAL
        // ----------------------------------------------------

        if (
            sessaoAtual !== versaoSessao ||
            !sessaoValida()
        ) {

            return;
        }

        cartao.remove();

        informar(
            "Comentário e registro de autoria excluídos."
        );

    } catch (erro) {

        console.error(
            "COJURIS — Exclusão administrativa:",
            erro.code || erro.message
        );

        informar(
            "Não foi possível excluir o comentário."
        );

    } finally {

        if (botao.isConnected) {
            botao.disabled = false;
        }
    }
}


// ============================================================
// 10 — AUTENTICAÇÃO E INICIALIZAÇÃO
//
// Observador independente de admin.js.
// ============================================================

onAuthStateChanged(
    auth,
    async usuario => {

        versaoSessao++;

        const sessaoAtual = versaoSessao;

        acessoAutorizado = false;

        usuarioAdmin = null;

        secao.hidden = true;

        lista.replaceChildren();

        btnAtualizar.disabled = true;

        if (!usuario) {
            return;
        }

        try {

            const permitido = await verificarAdministrador(
                usuario
            );

            if (
                sessaoAtual !== versaoSessao
            ) {

                return;
            }

            if (!permitido) {
                return;
            }

            usuarioAdmin = usuario;

            acessoAutorizado = true;

            secao.hidden = false;

            informar(
                "Área de moderação disponível."
            );

            await carregarModeracao();

        } catch (erro) {

            console.error(
                "COJURIS — Acesso à moderação:",
                erro.code || erro.message
            );

            if (sessaoAtual === versaoSessao) {
                secao.hidden = true;
            }
        }
    }
);


// ============================================================
// 11 — ATUALIZAÇÃO MANUAL
// ============================================================

btnAtualizar.addEventListener(
    "click",
    async () => {

        await carregarModeracao();
    }
);
