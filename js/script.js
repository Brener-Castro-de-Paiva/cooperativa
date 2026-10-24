/* ============================================================
   COJURIS — SCRIPT.JS | Interatividade e Efeitos
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

    /* --------------------------------------------------------
       1. MENU MOBILE (HAMBURGUER)
       -------------------------------------------------------- */
    const menuToggle = document.querySelector('.menu-toggle');
    const menu = document.querySelector('.menu');
    const menuLinks = document.querySelectorAll('.menu a');

    // Abre e fecha o menu ao clicar no botão hamburguer
    if (menuToggle && menu) {
        menuToggle.addEventListener('click', () => {
            menu.classList.toggle('active');
            
            // Acessibilidade: avisa leitores de tela se o menu está aberto
            const isExpanded = menu.classList.contains('active');
            menuToggle.setAttribute('aria-expanded', isExpanded);
        });
    }

    // Fecha o menu automaticamente ao clicar em qualquer link dele
    menuLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (menu.classList.contains('active')) {
                menu.classList.remove('active');
                menuToggle.setAttribute('aria-expanded', 'false');
            }
        });
    });

    /* --------------------------------------------------------
       2. HEADER STICKY (EFEITO GLASS AO ROLAR)
       -------------------------------------------------------- */
    const header = document.querySelector('.topo');
    
    const handleScroll = () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    };

    // Verifica ao carregar a página (caso o usuário dê F5 no meio dela)
    handleScroll();

    // Verifica a cada movimento de scroll
    window.addEventListener('scroll', handleScroll);

    /* --------------------------------------------------------
       3. SCROLL REVEAL (ANIMAÇÃO ELEGANTE DE ENTRADA)
       -------------------------------------------------------- */
    // Seleciona os elementos que queremos animar
    const elementsToReveal = document.querySelectorAll('.secao, .card-atuacao, .card-vantagem, .chamada-associacao');

    // Adiciona a classe inicial de animação (invisível e um pouco para baixo)
    elementsToReveal.forEach(el => el.classList.add('reveal'));

    // Configura o observador (dispara quando o elemento entra na tela)
    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Adiciona a classe que faz o elemento aparecer
                entry.target.classList.add('active');
                // Para de observar o elemento (a animação só ocorre uma vez)
                observer.unobserve(entry.target);
            }
        });
    }, {
        root: null, // usa a viewport do navegador
        threshold: 0.15, // dispara quando 15% do elemento estiver visível
        rootMargin: "0px 0px -50px 0px" // dispara um pouquinho antes de encostar no fim
    });

    // Manda o observador vigiar cada elemento
    elementsToReveal.forEach(el => revealObserver.observe(el));

    /* --------------------------------------------------------
       4. SCROLL SUAVE PARA LINKS INTERNOS (FALLBACK)
       -------------------------------------------------------- */
    // O CSS já tem scroll-behavior: smooth, mas o JS garante que funcione 
    // em navegadores mais antigos e ajuste o offset do menu fixo.
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                e.preventDefault();
                
                // Pega a altura do header para não cobrir o título
                const headerHeight = header.offsetHeight;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.scrollY - headerHeight;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });

});