
/* ============================================================
   COJURIS — MURAL PROFISSIONAL

   ARQUIVO: portal/js/recursos/mural.js
   REPOSITÓRIO: cooperativa

   ETAPA 01 — AUTENTICAÇÃO E PREPARAÇÃO DA INTERFACE

   FUNCIONALIDADES:

   01 — Importações Firebase
   02 — Elementos HTML
   03 — Estado da aplicação
   04 — Funções auxiliares
   05 — Identificação do perfil
   06 — Controle de permissões
   07 — Apresentação da interface
   08 — Contador de caracteres
   09 — Preparação da publicação
   10 — Preparação da listagem
   11 — Autenticação
   12 — Eventos

   PRIVACIDADE:

   - Não exibe perfis de outros cooperados.
   - Não consulta dados pessoais de terceiros.
   - A identificação administrativa será
     armazenada separadamente das publicações.

   IMPORTANTE:

   Esta versão não grava publicações no Firestore.

   A integração será habilitada após a criação
   e validação das regras de segurança do mural.
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
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";


// ============================================================
// 02 — ELEMENTOS DA INTERFACE
// ============================================================

const telaAcesso = document.getElementById(
    "mural-acesso"
);

const mensagemAcesso = document.getElementById(
    "mural-mensagem-acesso"
);

const aplicacao = document.getElementById(
    "mural-app"
);

const indicadorPerfil = document.getElementById(
    "mural-perfil"
);

const linkAdministracao = document.getElementById(
    "mural-link-admin"
);


// ------------------------------------------------------------
// 02.1 — PUBLICAÇÃO
// ------------------------------------------------------------

const areaPublicacao = document.getElementById(
    "mural-area-publicacao"
);

const formulario = document.getElementById(
    "mural-formulario"
);

const tituloProposta = document.getElementById(
    "mural-titulo-proposta"
);

const categoriaProposta = document.getElementById(
    "mural-categoria"
);

const textoProposta = document.getElementById(
    "mural-texto"
);

const contadorCaracteres = document.getElementById(
    "mural-contador"
);

const botaoPublicar = document.getElementById(
    "mural-publicar"
);

const statusPublicacao = document.getElementById(
    "mural-status-publicacao"
);


// ------------------------------------------------------------
// 02.2 — LISTAGEM
// ------------------------------------------------------------

const listaPublicacoes = document.getElementById(
    "mural-lista"
);

const statusListagem = document.getElementById(
    "mural-status-listagem"
);

const botaoAtualizar = document.getElementById(
    "mural-atualizar"
);

const botaoCarregarMais = document.getElementById(
    "mural-carregar-mais"
);

const avisoLeitura = document.getElementById(
    "mural-aviso-leitura"
);


// ============================================================
// 03 — CONFIGURAÇÕES E ESTADO
// ============================================================

const LIMITE_TITULO = 120;
const LIMITE_TEXTO = 2000;

const CATEGORIAS_VALIDAS = new Set([
    "sugestao",
    "discussao",
    "proposta",
    "duvida"
]);

let usuarioAtual = null;
let perfilAtual = "sem_sessao";

let versaoSessao = 0;


// ============================================================
// 04 — FUNÇÕES AUXILIARES
// ============================================================

function informarAcesso(mensagem) {
    mensagemAcesso.textContent = mensagem;
}

function informarPublicacao(mensagem) {
    statusPublicacao.textContent = mensagem;
}

function informarListagem(mensagem) {
    statusListagem.textContent = mensagem;
}


// ------------------------------------------------------------
// 04.1 — VERIFICAR SESSÃO
// ------------------------------------------------------------

function sessaoValida() {
    return (
        usuarioAtual !== null &&
        auth.currentUser !== null &&
        auth.currentUser.uid === usuarioAtual.uid
    );
}


// ------------------------------------------------------------
// 04.2 — LIMPAR ESTADO VISUAL
// ------------------------------------------------------------

function ocultarAplicacao() {

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

    informarPublicacao("");
    informarListagem("Aguardando autorização...");

    indicadorPerfil.textContent =
        "Consultando seu perfil...";
}


// ============================================================
// 05 — IDENTIFICAÇÃO DO PERFIL
//
// Reutiliza o modelo atual da COJURIS.
//
// Administrador:
// administradores/{uid}.ativo == true
//
// Participante:
// interessados/{uid}
// status == aprovado
// verificacaoProfissional == verificada
// ============================================================

async function identificarPerfil(usuario) {

    if (!usuario) {
        return "sem_sessao";
    }

    // --------------------------------------------------------
    // 05.1 — CONSULTAR ADMINISTRAÇÃO
    // --------------------------------------------------------

    const documentoAdministrador = await getDoc(
        doc(
            db,
            "administradores",
            usuario.uid
        )
    );

    if (
        documentoAdministrador.exists() &&
        documentoAdministrador.data().ativo === true
    ) {
        return "administrador";
    }


    // --------------------------------------------------------
    // 05.2 — CONSULTAR O PRÓPRIO CADASTRO
    // --------------------------------------------------------

    const documentoInteressado = await getDoc(
        doc(
            db,
            "interessados",
            usuario.uid
        )
    );

    if (!documentoInteressado.exists()) {
        return "sem_cadastro";
    }

    const dados = documentoInteressado.data();

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
// 06 — PERMISSÕES DE ACESSO
// ============================================================

function podeVisualizar(perfil) {
    return (
        perfil === "administrador" ||
        perfil === "participante" ||
        perfil === "leitor"
    );
}


function podePublicar(perfil) {
    return (
        perfil === "administrador" ||
        perfil === "participante"
    );
}


// ============================================================
// 07 — EXIBIÇÃO CONFORME O PERFIL
// ============================================================

function apresentarInterface() {

    if (!sessaoValida()) {
        return;
    }

    telaAcesso.hidden = true;
    aplicacao.hidden = false;

    // --------------------------------------------------------
    // 07.1 — ADMINISTRAÇÃO
    // --------------------------------------------------------

    if (perfilAtual === "administrador") {

        indicadorPerfil.textContent =
            "Administração COJURIS";

        linkAdministracao.hidden = false;

        areaPublicacao.hidden = false;
        avisoLeitura.hidden = true;

    // --------------------------------------------------------
    // 07.2 — COOPERADO VERIFICADO
    // --------------------------------------------------------

    } else if (perfilAtual === "participante") {

        indicadorPerfil.textContent =
            "Cooperado verificado";

        linkAdministracao.hidden = true;

        areaPublicacao.hidden = false;
        avisoLeitura.hidden = true;

    // --------------------------------------------------------
    // 07.3 — LEITOR
    // --------------------------------------------------------

    } else {

        indicadorPerfil.textContent =
            "Aguardando verificação profissional";

        linkAdministracao.hidden = true;

        areaPublicacao.hidden = true;
        avisoLeitura.hidden = false;
    }

    // A interface está preparada, mas a gravação
    // permanece bloqueada nesta etapa.

    botaoPublicar.disabled = true;
    botaoAtualizar.disabled = true;

    botaoCarregarMais.disabled = true;
    botaoCarregarMais.hidden = true;

    if (podePublicar(perfilAtual)) {

        informarPublicacao(
            "O formulário está preparado. " +
            "A publicação será habilitada após a " +
            "configuração das regras de segurança."
        );
    }

    informarListagem(
        "O mural está sendo preparado. " +
        "As publicações aparecerão aqui após " +
        "a integração com o Firebase."
    );
}


// ============================================================
// 08 — CONTADOR DE CARACTERES
// ============================================================

function atualizarContadorCaracteres() {

    const quantidade = textoProposta.value.length;

    contadorCaracteres.textContent =
        `${quantidade} / ${LIMITE_TEXTO} caracteres`;
}


textoProposta.addEventListener(
    "input",
    atualizarContadorCaracteres
);


// ============================================================
// 09 — VALIDAÇÃO DO FORMULÁRIO
//
// Preparação da integração futura.
// Nenhuma gravação ocorre nesta versão.
// ============================================================

function validarFormulario() {

    const titulo = tituloProposta.value.trim();

    const categoria = categoriaProposta.value;

    const texto = textoProposta.value.trim();


    // --------------------------------------------------------
    // 09.1 — TÍTULO
    // --------------------------------------------------------

    if (
        titulo.length < 5 ||
        titulo.length > LIMITE_TITULO
    ) {

        informarPublicacao(
            "O título deve conter entre " +
            "5 e 120 caracteres."
        );

        return false;
    }


    // --------------------------------------------------------
    // 09.2 — CATEGORIA
    // --------------------------------------------------------

    if (!CATEGORIAS_VALIDAS.has(categoria)) {

        informarPublicacao(
            "Selecione uma categoria válida."
        );

        return false;
    }


    // --------------------------------------------------------
    // 09.3 — CONTEÚDO
    // --------------------------------------------------------

    if (
        texto.length < 10 ||
        texto.length > LIMITE_TEXTO
    ) {

        informarPublicacao(
            "O conteúdo deve conter entre " +
            "10 e 2.000 caracteres."
        );

        return false;
    }

    return true;
}


// ============================================================
// 10 — PUBLICAÇÃO
//
// Nesta primeira etapa, não executamos addDoc,
// setDoc, writeBatch ou runTransaction.
//
// Isso evita gravar dados em coleções ainda sem
// regras próprias de segurança.
// ============================================================

async function publicarProposta(evento) {

    evento.preventDefault();

    if (
        !sessaoValida() ||
        !podePublicar(perfilAtual)
    ) {

        informarPublicacao(
            "Sua conta não está autorizada " +
            "a publicar propostas."
        );

        return;
    }

    if (!validarFormulario()) {
        return;
    }

    informarPublicacao(
        "A publicação ainda não está habilitada. " +
        "A integração com o Firebase será " +
        "implementada na próxima etapa."
    );
}


// ============================================================
// 11 — LISTAGEM DE PUBLICAÇÕES
//
// Preparada para a futura coleção do mural.
//
// Não executamos consultas ao Firestore antes
// de definir e validar as regras de acesso.
// ============================================================

async function carregarPublicacoes() {

    if (
        !sessaoValida() ||
        !podeVisualizar(perfilAtual)
    ) {
        return;
    }

    listaPublicacoes.replaceChildren();

    botaoCarregarMais.hidden = true;

    informarListagem(
        "Nenhuma publicação carregada. " +
        "A integração do mural está em desenvolvimento."
    );
}


// ============================================================
// 12 — AUTENTICAÇÃO
//
// A aplicação somente é exibida depois da
// identificação e autorização do usuário.
//
// Cada mudança de sessão invalida verificações
// pendentes de uma sessão anterior.
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
            "Verificando seu acesso ao mural..."
        );

        try {

            // ------------------------------------------------
            // 12.1 — IDENTIFICAR PERFIL
            // ------------------------------------------------

            const perfil = await identificarPerfil(
                usuario
            );

            // Evita utilizar dados de outra sessão.

            if (
                sessaoDaConsulta !== versaoSessao ||
                auth.currentUser?.uid !== usuario.uid
            ) {
                return;
            }


            // ------------------------------------------------
            // 12.2 — VERIFICAR PERMISSÃO
            // ------------------------------------------------

            if (!podeVisualizar(perfil)) {

                informarAcesso(
                    "Sua conta ainda não possui " +
                    "autorização para acessar o mural."
                );

                return;
            }


            // ------------------------------------------------
            // 12.3 — REGISTRAR SESSÃO AUTORIZADA
            // ------------------------------------------------

            usuarioAtual = usuario;
            perfilAtual = perfil;


            // ------------------------------------------------
            // 12.4 — EXIBIR INTERFACE
            // ------------------------------------------------

            apresentarInterface();

            atualizarContadorCaracteres();

            await carregarPublicacoes();

        } catch (erro) {

            console.error(
                "COJURIS — Autorização do mural:",
                erro
            );

            if (sessaoDaConsulta !== versaoSessao) {
                return;
            }

            ocultarAplicacao();

            informarAcesso(
                "Não foi possível verificar sua " +
                "autorização. Atualize a página " +
                "e tente novamente."
            );
        }
    }
);


// ============================================================
// 13 — EVENTOS
// ============================================================


// ------------------------------------------------------------
// 13.1 — FORMULÁRIO
// ------------------------------------------------------------

formulario.addEventListener(
    "submit",
    publicarProposta
);


// ------------------------------------------------------------
// 13.2 — ATUALIZAR LISTAGEM
// ------------------------------------------------------------

botaoAtualizar.addEventListener(
    "click",
    async () => {

        await carregarPublicacoes();
    }
);


// ------------------------------------------------------------
// 13.3 — CARREGAR MAIS
//
// Paginação será implementada quando a
// coleção de publicações estiver definida.
// ------------------------------------------------------------

botaoCarregarMais.addEventListener(
    "click",
    () => {

        informarListagem(
            "A paginação será habilitada " +
            "com a integração do mural."
        );
    }
);
