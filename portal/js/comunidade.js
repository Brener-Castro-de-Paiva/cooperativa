
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
   13 — Sincronização das notificações dispensadas
   14 — Dispensa individual diretamente pelo card

   A coleção "comunicados" é compartilhada com
   portal/comunicados.html.

   FUNCIONALIDADES PRESERVADAS:
   - Autenticação Firebase
   - Controle de acesso
   - Perfis administrativos
   - Visualização de comunicados
   - Paginação
   - Identidade visual original
   - Atualização de comunicados
   - Sincronização com notificações do sino

   NOVA FUNCIONALIDADE:
   - Botão × individual em cada card
   - Confirmação antes de dispensar
   - Registro de leitura quando necessário
   - Registro individual de dispensadoEm
   - Atualização automática do sino

   SEGURANÇA:
   Nenhum comunicado original será excluído.
   As regras do Firestore continuam responsáveis
   por validar as operações.
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
    startAfter,
    onSnapshot,
    setDoc,
    updateDoc,
    serverTimestamp
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

let usuarioAtual = null;

let ultimoDocumento = null;

let carregando = false;

let terminouListagem = false;

let totalExibido = 0;

// Impede que respostas de sessões anteriores
// sejam apresentadas ao usuário atual.

let versaoSessao = 0;

// Identifica a consulta de listagem mais recente.

let versaoListagem = 0;


// ============================================================
// 03.1 — NOTIFICAÇÕES DISPENSADAS
//
// Caminho:
//
// leituras_comunicados/{uid}/itens/{comunicadoId}
//
// Os registros com dispensadoEm ficam ocultos.
//
// Nenhuma informação é excluída do comunicado.
// ============================================================

let idsDispensados = new Set();

let idsLidos = new Set();

let cancelarObservadorDispensas = null;

let dispensasCarregadas = false;


// ============================================================
// 03.2 — CONTROLE DAS OPERAÇÕES
//
// Evita cliques repetidos no mesmo botão.
// ============================================================

const dispensasEmAndamento = new Set();


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
// 04.1 — ATUALIZAR CONTADOR VISUAL
// ============================================================

function atualizarQuantidadeComunicados() {

    if (totalExibido === 0) {

        mensagemComunicados.textContent =
            terminouListagem
                ? "Não há comunicados na sua lista."
                : "Nenhum comunicado exibido nesta página. " +
                  "Você pode carregar mais.";

        return;
    }

    mensagemComunicados.textContent =
        `${totalExibido} comunicado(s) exibido(s).`;
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

    if (
        !timestamp ||
        typeof timestamp.toDate !== "function"
    ) {

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
// Mantemos as classes originais do CSS:
//
// post-card
// post-header
// post-avatar
// post-author
// content-tag
// post-footer
//
// Dessa forma, conservamos o design original.
//
// NOVO:
// Incluímos somente o botão × de dispensa.
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

    // Identificação utilizada na sincronização.

    cartao.dataset.comunicadoId = documento.id;

    // Permite posicionar o botão ×
    // sem alterar o layout dos demais elementos.

    cartao.style.position = "relative";

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
    // 09.6 — MONTAGEM ORIGINAL
    // --------------------------------------------

    cartao.append(
        cabecalho,
        categoria,
        titulo,
        conteudo,
        rodape
    );

    // --------------------------------------------
    // 09.7 — NOVO BOTÃO DE DISPENSA INDIVIDUAL
    //
    // A exclusão é apenas visual e pessoal.
    //
    // Não utiliza deleteDoc().
    // --------------------------------------------

    const botaoDispensar = criarElemento(
        "button",
        "comunidade-dispensar-comunicado",
        "×"
    );

    botaoDispensar.type = "button";

    botaoDispensar.title =
        "Retirar comunicado da minha lista";

    botaoDispensar.setAttribute(
        "aria-label",
        `Retirar comunicado da minha lista: ${
            dados.titulo || "Comunicado"
        }`
    );

    // Estilo pontual do novo botão.
    // Não substitui o CSS da comunidade.

    Object.assign(
        botaoDispensar.style,
        {
            position: "absolute",
            top: "18px",
            right: "20px",

            width: "30px",
            height: "30px",

            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",

            margin: "0",
            padding: "0",

            border: "1px solid #e1e9ed",
            borderRadius: "8px",

            background: "#ffffff",
            color: "#8196a1",

            fontFamily: "inherit",
            fontSize: "19px",
            fontWeight: "400",
            lineHeight: "1",

            cursor: "pointer",
            zIndex: "2"
        }
    );

    botaoDispensar.addEventListener(
        "mouseenter",
        () => {

            if (!botaoDispensar.disabled) {

                botaoDispensar.style.background =
                    "#eef7f6";

                botaoDispensar.style.color =
                    "#173a4c";
            }
        }
    );

    botaoDispensar.addEventListener(
        "mouseleave",
        () => {

            botaoDispensar.style.background =
                "#ffffff";

            botaoDispensar.style.color =
                "#8196a1";
        }
    );

    botaoDispensar.addEventListener(
        "click",
        async evento => {

            evento.stopPropagation();

            await dispensarComunicadoDoCard(
                documento.id,
                dados.titulo || "Comunicado",
                botaoDispensar
            );
        }
    );

    cartao.appendChild(botaoDispensar);

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
//
// IMPORTANTE:
// O cursor considera TODOS os documentos retornados,
// inclusive os que foram dispensados pelo usuário.
// ============================================================

async function carregarComunicados(reiniciar = false) {

    if (
        !perfilAtual ||
        carregando ||
        !dispensasCarregadas
    ) {

        return;
    }

    const sessaoDaConsulta = versaoSessao;

    const requisicaoAtual = ++versaoListagem;

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

        if (
            sessaoDaConsulta !== versaoSessao ||
            requisicaoAtual !== versaoListagem
        ) {

            return;
        }

        // --------------------------------------------
        // 10.3 — INSERÇÃO DOS CARTÕES
        //
        // Não mostra comunicados dispensados.
        // --------------------------------------------

        const fragmento =
            document.createDocumentFragment();

        resultado.forEach(documento => {

            if (idsDispensados.has(documento.id)) {
                return;
            }

            fragmento.appendChild(
                criarCartaoComunicado(documento)
            );

            totalExibido++;
        });

        listaComunicados.appendChild(fragmento);

        // --------------------------------------------
        // 10.4 — CURSOR DE PAGINAÇÃO
        //
        // Considera todos os documentos consultados,
        // mesmo os ocultos pessoalmente.
        // --------------------------------------------

        if (!resultado.empty) {

            ultimoDocumento =
                resultado.docs[resultado.docs.length - 1];
        }

        terminouListagem =
            resultado.size < TAMANHO_PAGINA;

        btnCarregarMais.hidden = terminouListagem;

        // --------------------------------------------
        // 10.5 — MENSAGEM AO USUÁRIO
        // --------------------------------------------

        atualizarQuantidadeComunicados();

    } catch (erro) {

        if (
            sessaoDaConsulta !== versaoSessao ||
            requisicaoAtual !== versaoListagem
        ) {

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

        if (
            sessaoDaConsulta === versaoSessao &&
            requisicaoAtual === versaoListagem
        ) {

            carregando = false;

            btnAtualizar.disabled = false;

            btnCarregarMais.disabled =
                terminouListagem;
        }
    }
}


// ============================================================
// 13 — SINCRONIZAÇÃO DAS DISPENSAS
//
// Observa os documentos individuais do usuário.
//
// Quando o sino ou o card registra dispensadoEm,
// o comunicado correspondente desaparece.
//
// Não altera os comunicados originais.
// ============================================================

function sincronizarCartoesDispensados() {

    const cartoes = listaComunicados.querySelectorAll(
        "[data-comunicado-id]"
    );

    let houveRemocao = false;

    cartoes.forEach(cartao => {

        const id = cartao.dataset.comunicadoId;

        if (idsDispensados.has(id)) {

            cartao.remove();

            totalExibido = Math.max(
                0,
                totalExibido - 1
            );

            houveRemocao = true;
        }
    });

    if (houveRemocao && !carregando) {

        atualizarQuantidadeComunicados();
    }
}


// ------------------------------------------------------------
// PRIMEIRA CONSULTA E ATUALIZAÇÕES EM TEMPO REAL
//
// A primeira resposta precisa chegar antes da
// primeira listagem para evitar mostrar cartões
// que já foram dispensados.
// ------------------------------------------------------------

function acompanharDispensas(usuario, sessaoAtual) {

    return new Promise((resolver, rejeitar) => {

        let primeiraResposta = true;

        const referencia = collection(
            db,
            "leituras_comunicados",
            usuario.uid,
            "itens"
        );

        cancelarObservadorDispensas = onSnapshot(

            referencia,

            resultado => {

                if (sessaoAtual !== versaoSessao) {
                    return;
                }

                // Registra IDs já visualizados.

                idsLidos = new Set(
                    resultado.docs
                        .filter(documento =>
                            documento.data().lidoEm != null
                        )
                        .map(documento => documento.id)
                );

                // Registra IDs dispensados.

                idsDispensados = new Set(
                    resultado.docs
                        .filter(documento =>
                            documento.data().dispensadoEm != null
                        )
                        .map(documento => documento.id)
                );

                dispensasCarregadas = true;

                sincronizarCartoesDispensados();

                if (primeiraResposta) {

                    primeiraResposta = false;

                    resolver();
                }
            },

            erro => {

                if (sessaoAtual !== versaoSessao) {
                    return;
                }

                console.error(
                    "COJURIS — Consulta de dispensas:",
                    erro.code || erro.message
                );

                dispensasCarregadas = false;

                if (primeiraResposta) {

                    primeiraResposta = false;

                    rejeitar(erro);

                } else {

                    mensagemComunicados.textContent =
                        "Não foi possível sincronizar as " +
                        "notificações dispensadas.";
                }
            }
        );
    });
}


// ============================================================
// 14 — DISPENSAR COMUNICADO DIRETAMENTE PELO CARD
//
// NOVA FUNCIONALIDADE
//
// ETAPAS:
// 1. Confirmação do usuário;
// 2. Verificação da sessão;
// 3. Registro de lidoEm, quando necessário;
// 4. Registro de dispensadoEm;
// 5. Ocultação automática pelo observador.
//
// A operação nunca exclui documentos da
// coleção comunicados.
// ============================================================

async function dispensarComunicadoDoCard(
    comunicadoId,
    tituloComunicado,
    botao
) {

    // --------------------------------------------------------
    // 14.1 — VALIDAÇÕES INICIAIS
    // --------------------------------------------------------

    if (
        !usuarioAtual ||
        !perfilAtual ||
        !dispensasCarregadas
    ) {

        return;
    }

    if (idsDispensados.has(comunicadoId)) {
        return;
    }

    if (dispensasEmAndamento.has(comunicadoId)) {
        return;
    }

    // --------------------------------------------------------
    // 14.2 — CONFIRMAÇÃO
    //
    // Explica que a ação é individual e não definitiva.
    // --------------------------------------------------------

    const confirmado = window.confirm(
        `Retirar o comunicado da sua lista?\n\n` +
        `${tituloComunicado}\n\n` +
        `O comunicado continuará disponível ` +
        `para os demais participantes e para ` +
        `a administração da COJURIS.`
    );

    if (!confirmado) {
        return;
    }

    // --------------------------------------------------------
    // 14.3 — PROTEÇÃO CONTRA CLIQUES REPETIDOS
    // --------------------------------------------------------

    dispensasEmAndamento.add(comunicadoId);

    botao.disabled = true;

    botao.style.opacity = "0.45";

    botao.style.cursor = "wait";

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

        // ----------------------------------------------------
        // 14.4 — CONSULTAR O REGISTRO EXISTENTE
        //
        // O Firestore é consultado antes da escrita
        // para evitar sobrescrever uma leitura anterior.
        // ----------------------------------------------------

        const registroAtual = await getDoc(
            referencia
        );

        if (
            sessaoDaOperacao !== versaoSessao ||
            !usuarioAtual ||
            usuarioAtual.uid !== uid
        ) {

            return;
        }

        // ----------------------------------------------------
        // 14.5 — PRIMEIRA VISUALIZAÇÃO
        //
        // Se ainda não existe um documento de leitura,
        // cria exclusivamente o campo lidoEm.
        //
        // Isso é compatível com as regras atuais.
        // ----------------------------------------------------

        if (!registroAtual.exists()) {

            await setDoc(
                referencia,
                {
                    lidoEm: serverTimestamp()
                }
            );

        } else {

            const dadosAtuais = registroAtual.data();

            // Se a notificação já estiver dispensada
            // em outra aba, não repetimos a gravação.

            if (dadosAtuais.dispensadoEm) {

                idsDispensados.add(comunicadoId);

                sincronizarCartoesDispensados();

                return;
            }

            // A permissão atual não permite atualizar
            // livremente o campo lidoEm.

            if (!dadosAtuais.lidoEm) {

                throw new Error(
                    "Registro de leitura sem lidoEm."
                );
            }
        }

        // ----------------------------------------------------
        // 14.6 — VERIFICAÇÃO DA SESSÃO
        // ----------------------------------------------------

        if (
            sessaoDaOperacao !== versaoSessao ||
            !usuarioAtual ||
            usuarioAtual.uid !== uid
        ) {

            return;
        }

        // ----------------------------------------------------
        // 14.7 — DISPENSA INDIVIDUAL
        //
        // updateDoc altera somente dispensadoEm.
        //
        // lidoEm permanece preservado.
        // ----------------------------------------------------

        await updateDoc(
            referencia,
            {
                dispensadoEm: serverTimestamp()
            }
        );

        // ----------------------------------------------------
        // 14.8 — RESULTADO
        // ----------------------------------------------------

        if (
            sessaoDaOperacao !== versaoSessao ||
            !usuarioAtual ||
            usuarioAtual.uid !== uid
        ) {

            return;
        }

        idsLidos.add(comunicadoId);

        idsDispensados.add(comunicadoId);

        // O observador onSnapshot também receberá
        // a atualização e sincronizará a listagem.

        sincronizarCartoesDispensados();

    } catch (erro) {

        console.error(
            "COJURIS — Erro ao dispensar comunicado:",
            erro.code || erro.message
        );

        if (sessaoDaOperacao === versaoSessao) {

            window.alert(
                "Não foi possível retirar o comunicado " +
                "da sua lista.\n\n" +
                "Tente novamente."
            );
        }

    } finally {

        dispensasEmAndamento.delete(
            comunicadoId
        );

        if (botao.isConnected) {

            botao.disabled = false;

            botao.style.opacity = "1";

            botao.style.cursor = "pointer";
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

    async usuario => {

        versaoSessao++;

        // ----------------------------------------------------
        // 11.1 — ENCERRAMENTO DA SESSÃO ANTERIOR
        // ----------------------------------------------------

        if (cancelarObservadorDispensas) {

            cancelarObservadorDispensas();

            cancelarObservadorDispensas = null;
        }

        idsDispensados = new Set();

        idsLidos = new Set();

        dispensasCarregadas = false;

        dispensasEmAndamento.clear();

        versaoListagem++;

        carregando = false;

        perfilAtual = null;

        usuarioAtual = null;

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

                usuarioAtual = usuario;

                liberarPagina(perfil);

                // Consulta as leituras e dispensas
                // antes de apresentar a primeira página.

                await acompanharDispensas(
                    usuario,
                    sessaoAtual
                );

                if (sessaoAtual !== versaoSessao) {
                    return;
                }

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
                "COJURIS — Autorização ou dispensas:",
                erro.code || erro.message
            );

            mostrarMensagemAcesso(
                "Não foi possível verificar suas permissões " +
                "ou sincronizar os comunicados. " +
                "Confira sua conexão e tente novamente."
            );
        }
    },

    erro => {

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

btnAtualizar.addEventListener(
    "click",
    async () => {

        await carregarComunicados(true);
    }
);


// Carrega a próxima página da listagem.

btnCarregarMais.addEventListener(
    "click",
    async () => {

        if (!terminouListagem) {

            await carregarComunicados(false);
        }
    }
);
