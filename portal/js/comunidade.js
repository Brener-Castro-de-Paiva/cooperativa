
/* ============================================================
   COJURIS — COMUNIDADE PROFISSIONAL

   ARQUIVO: portal/js/comunidade.js

   01 — Importações do Firebase
   02 — Elementos do HTML
   03 — Estado da aplicação
   04 — Apresentação e acesso
   05 — Identificação administrativa
   06 — Classificação do interessado
   07 — Criação segura de elementos
   08 — Formatação de datas
   09 — Montagem dos comunicados
   10 — Consulta paginada ao Firestore
   11 — Autenticação
   12 — Eventos

   A coleção "comunicados" é compartilhada com
   portal/comunicados.html.

   A página da comunidade faz somente leituras.
   ============================================================ */


// ============================================================
// 01 — IMPORTAÇÕES
// ============================================================

import { auth, db } from "./firebase-config.js";

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
    limit,
    startAfter
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";


// ============================================================
// 02 — ELEMENTOS DO HTML
// ============================================================

const aplicativo = document.getElementById(
    "comunidade-app"
);

const telaAcesso = document.getElementById(
    "comunidade-acesso"
);

const mensagemAcesso = document.getElementById(
    "comunidade-mensagem"
);

const indicadorPerfil = document.getElementById(
    "comunidade-perfil"
);

const avisoLeitura = document.getElementById(
    "aviso-modo-leitura"
);

const listaComunicados = document.getElementById(
    "comunidade-lista-comunicados"
);

const mensagemComunicados = document.getElementById(
    "comunicados-mensagem"
);

const btnAtualizar = document.getElementById(
    "comunidade-atualizar"
);

const btnCarregarMais = document.getElementById(
    "comunidade-carregar-mais"
);

const areaGerenciamento = document.getElementById(
    "comunidade-gerenciar"
);


// ============================================================
// 03 — ESTADO DA APLICAÇÃO
//
// Controla as consultas ao banco e a paginação.
// ============================================================

const TAMANHO_PAGINA = 5;

let perfilAtual = null;

let ultimoDocumento = null;

let carregando = false;

let terminouListagem = false;

let totalExibido = 0;

// Usado para ignorar respostas de consultas anteriores
// quando ocorre alteração da sessão ou atualização.

let versaoSessao = 0;


// ============================================================
// 04 — APRESENTAÇÃO E CONTROLE DE ACESSO
// ============================================================

function mostrarMensagemAcesso(texto) {

    aplicativo.hidden = true;

    telaAcesso.hidden = false;

    mensagemAcesso.textContent = texto;
}


function limparComunicados() {

    listaComunicados.replaceChildren();

    ultimoDocumento = null;

    terminouListagem = false;

    totalExibido = 0;

    btnCarregarMais.hidden = true;

    btnCarregarMais.disabled = true;
}


// Esta função não altera as regras do Firestore.
// Apenas adapta a interface ao perfil identificado.

function liberarPagina(perfil) {

    perfilAtual = perfil;

    document.body.dataset.perfilComunidade = perfil;

    const nomes = {
        administrador: "Administração",
        participante: "Participante verificado",
        leitor: "Modo leitura"
    };

    indicadorPerfil.textContent =
        nomes[perfil] || "Comunidade";

    avisoLeitura.hidden = perfil !== "leitor";

    areaGerenciamento.hidden =
        perfil !== "administrador";

    telaAcesso.hidden = true;

    aplicativo.hidden = false;

    btnAtualizar.disabled = false;
}


// ============================================================
// 05 — IDENTIFICAÇÃO ADMINISTRATIVA
//
// Consulta somente o documento do usuário
// autenticado na coleção administradores.
// ============================================================

async function ehAdministrador(usuario) {

    const referencia = doc(
        db,
        "administradores",
        usuario.uid
    );

    const resultado = await getDoc(referencia);

    return (
        resultado.exists() &&
        resultado.data().ativo === true
    );
}


// ============================================================
// 06 — CLASSIFICAÇÃO DE PERMISSÕES
//
// Administrador:
//   acesso administrativo.
//
// Participante:
//   aprovado e profissionalmente verificado.
//
// Leitor:
//   cadastro pendente ou aprovado sem verificação.
//
// Rejeitado:
//   não autorizado.
// ============================================================

async function identificarPerfil(usuario) {

    if (await ehAdministrador(usuario)) {

        return "administrador";
    }


    const referencia = doc(
        db,
        "interessados",
        usuario.uid
    );

    const resultado = await getDoc(referencia);

    if (!resultado.exists()) {

        return "sem_cadastro";
    }


    const dados = resultado.data();


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
// 07 — CONSTRUÇÃO SEGURA DE ELEMENTOS
//
// textContent apresenta o conteúdo como texto,
// sem interpretá-lo como HTML ou JavaScript.
//
// Isso é importante para textos obtidos do Firestore.
// ============================================================

function criarElemento(tag, classe, texto) {

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
// 08 — FORMATAÇÃO DE DATAS
// ============================================================

function formatarData(timestamp) {

    if (!timestamp || typeof timestamp.toDate !== "function") {

        return "Comunicado institucional";
    }

    const data = timestamp.toDate();

    return new Intl.DateTimeFormat(
        "pt-BR",
        {
            dateStyle: "long",
            timeStyle: "short"
        }
    ).format(data);
}


// ============================================================
// 09 — CRIAÇÃO DO CARTÃO DE COMUNICADO
//
// Mantemos as classes que já existem no CSS:
//
// post-card
// post-header
// post-avatar
// post-author
// content-tag
// post-footer
//
// Dessa forma, conservamos o design original.
// ============================================================

function criarCartaoComunicado(documento) {

    const dados = documento.data();

    // --------------------------------------------
    // 09.1 — CARTÃO PRINCIPAL
    // --------------------------------------------

    const cartao = criarElemento(
        "article",
        "post-card"
    );


    // --------------------------------------------
    // 09.2 — CABEÇALHO
    // --------------------------------------------

    const cabecalho = criarElemento(
        "div",
        "post-header"
    );

    const avatar = criarElemento(
        "span",
        "post-avatar",
        "✦"
    );

    avatar.setAttribute("aria-hidden", "true");


    const identificacao = criarElemento(
        "div",
        "post-author"
    );

    const autor = criarElemento(
        "strong",
        "",
        "COJURIS"
    );

    const dataTexto = formatarData(
        dados.publicadoEm
    );

    const data = criarElemento(
        "time",
        "",
        dataTexto
    );

    if (
        dados.publicadoEm &&
        typeof dados.publicadoEm.toDate === "function"
    ) {

        data.dateTime =
            dados.publicadoEm.toDate().toISOString();
    }

    identificacao.append(
        autor,
        data
    );

    cabecalho.append(
        avatar,
        identificacao
    );


    // --------------------------------------------
    // 09.3 — IDENTIFICAÇÃO INSTITUCIONAL
    // --------------------------------------------

    const categoria = criarElemento(
        "span",
        "content-tag",
        "Institucional"
    );


    // --------------------------------------------
    // 09.4 — TÍTULO E CONTEÚDO
    // --------------------------------------------

    const titulo = criarElemento(
        "h3",
        "",
        dados.titulo || "Comunicado"
    );

    const conteudo = criarElemento(
        "p",
        "comunidade-post-conteudo",
        dados.conteudo || ""
    );


    // --------------------------------------------
    // 09.5 — RODAPÉ
    // --------------------------------------------

    const rodape = criarElemento(
        "div",
        "post-footer"
    );

    const identificacaoRodape = criarElemento(
        "span",
        "",
        "Comunicado oficial"
    );

    const simbolo = criarElemento(
        "span",
        "",
        "✦"
    );

    simbolo.setAttribute("aria-hidden", "true");

    rodape.append(
        identificacaoRodape,
        simbolo
    );


    // --------------------------------------------
    // 09.6 — MONTAGEM FINAL
    // --------------------------------------------

    cartao.append(
        cabecalho,
        categoria,
        titulo,
        conteudo,
        rodape
    );

    return cartao;
}


// ============================================================
// 10 — CONSULTA PAGINADA AO FIRESTORE
//
// Ordena os comunicados por publicadoEm,
// exibindo os mais recentes primeiro.
//
// A coleção possui as mesmas regras utilizadas
// por comunicados.html.
//
// Carregamos cinco documentos por consulta.
// ============================================================

async function carregarComunicados(reiniciar = false) {

    if (!perfilAtual || carregando) {

        return;
    }

    const sessaoDaConsulta = versaoSessao;

    carregando = true;

    btnAtualizar.disabled = true;

    btnCarregarMais.disabled = true;


    if (reiniciar) {

        limparComunicados();
    }


    mensagemComunicados.textContent =
        "Carregando comunicados...";


    try {

        const referencia = collection(
            db,
            "comunicados"
        );

        let consulta;


        // --------------------------------------------
        // 10.1 — PRIMEIRA PÁGINA OU PÁGINA SEGUINTE
        // --------------------------------------------

        if (ultimoDocumento) {

            consulta = query(
                referencia,
                orderBy("publicadoEm", "desc"),
                startAfter(ultimoDocumento),
                limit(TAMANHO_PAGINA)
            );

        } else {

            consulta = query(
                referencia,
                orderBy("publicadoEm", "desc"),
                limit(TAMANHO_PAGINA)
            );
        }


        // --------------------------------------------
        // 10.2 — CONSULTA REAL
        // --------------------------------------------

        const resultado = await getDocs(consulta);


        // Caso a sessão tenha mudado durante a consulta,
        // não mostramos resultados da sessão anterior.

        if (sessaoDaConsulta !== versaoSessao) {

            return;
        }


        // --------------------------------------------
        // 10.3 — INSERÇÃO DOS CARTÕES
        // --------------------------------------------

        const fragmento =
            document.createDocumentFragment();

        resultado.forEach((documento) => {

            fragmento.appendChild(
                criarCartaoComunicado(documento)
            );

            totalExibido++;
        });

        listaComunicados.appendChild(fragmento);


        // --------------------------------------------
        // 10.4 — CURSOR DE PAGINAÇÃO
        // --------------------------------------------

        if (!resultado.empty) {

            ultimoDocumento =
                resultado.docs[resultado.docs.length - 1];
        }

        terminouListagem =
            resultado.size < TAMANHO_PAGINA;

        btnCarregarMais.hidden =
            terminouListagem || totalExibido === 0;


        // --------------------------------------------
        // 10.5 — MENSAGEM AO USUÁRIO
        // --------------------------------------------

        if (totalExibido === 0) {

            mensagemComunicados.textContent =
                "Não há comunicados publicados.";

        } else {

            mensagemComunicados.textContent =
                `${totalExibido} comunicado(s) exibido(s).`;
        }

    } catch (erro) {

        if (sessaoDaConsulta !== versaoSessao) {

            return;
        }

        console.error(
            "COJURIS — Consulta de comunicados:",
            erro.code || erro.message
        );

        mensagemComunicados.textContent =
            "Não foi possível carregar os comunicados. " +
            "Utilize Atualizar comunicados para tentar novamente.";

    } finally {

        carregando = false;

        if (sessaoDaConsulta === versaoSessao) {

            btnAtualizar.disabled = false;

            btnCarregarMais.disabled =
                terminouListagem;
        }
    }
}


// ============================================================
// 11 — OBSERVADOR DE AUTENTICAÇÃO
//
// Mantém o mesmo controle de segurança anterior.
//
// A listagem somente é iniciada após verificar
// as permissões do usuário.
// ============================================================

mostrarMensagemAcesso(
    "Verificando sua autorização..."
);

onAuthStateChanged(

    auth,

    async (usuario) => {

        versaoSessao++;

        perfilAtual = null;

        aplicativo.hidden = true;

        btnAtualizar.disabled = true;

        btnCarregarMais.disabled = true;

        limparComunicados();


        if (!usuario) {

            window.location.replace("./index.html");

            return;
        }


        mostrarMensagemAcesso(
            "Verificando sua autorização..."
        );


        const sessaoAtual = versaoSessao;


        try {

            const perfil = await identificarPerfil(
                usuario
            );


            if (sessaoAtual !== versaoSessao) {

                return;
            }


            if (
                perfil === "administrador" ||
                perfil === "participante" ||
                perfil === "leitor"
            ) {

                liberarPagina(perfil);

                await carregarComunicados(true);

                return;
            }


            const mensagens = {

                rejeitado:
                    "Sua solicitação de ingresso não está " +
                    "habilitada para acessar a comunidade.",

                sem_cadastro:
                    "Não encontramos sua manifestação " +
                    "de interesse na COJURIS.",

                sem_permissao:
                    "Não foi possível autorizar seu acesso."
            };


            mostrarMensagemAcesso(
                mensagens[perfil] ||
                "Acesso não autorizado."
            );

        } catch (erro) {

            if (sessaoAtual !== versaoSessao) {

                return;
            }

            console.error(
                "COJURIS — Autorização:",
                erro.code || erro.message
            );

            mostrarMensagemAcesso(
                "Não foi possível verificar suas permissões. " +
                "Confira sua conexão e tente novamente."
            );
        }
    },

    (erro) => {

        console.error(
            "COJURIS — Autenticação:",
            erro
        );

        mostrarMensagemAcesso(
            "Não foi possível verificar sua sessão."
        );
    }
);


// ============================================================
// 12 — EVENTOS DOS BOTÕES
// ============================================================

// Atualiza a listagem a partir do Firestore.

btnAtualizar.addEventListener("click", async () => {

    await carregarComunicados(true);
});


// Carrega a próxima página da listagem.

btnCarregarMais.addEventListener("click", async () => {

    if (!terminouListagem) {

        await carregarComunicados(false);
    }
});
