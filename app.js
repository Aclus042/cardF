/* =====================================================
   NARRATIVE CARDS - WORLDBUILDING TOOL
   JavaScript Application
   ===================================================== */

// =====================================================
// DATA STORE
// =====================================================

class DataStore {
    constructor() {
        this.cards = [];
        this.navigationHistory = [];
    }

    generateId() {
        return 'card_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Get the next available number for a card type
    getNextNumber(type) {
        const cardsOfType = this.cards.filter(c => c.type === type);
        if (cardsOfType.length === 0) return 1;
        const maxNumber = Math.max(...cardsOfType.map(c => c.number || 0));
        return maxNumber + 1;
    }

    // Assign numbers to cards that don't have them (legacy cards)
    ensureAllCardsHaveNumbers() {
        const types = ['evento', 'local', 'personagem'];
        
        types.forEach(type => {
            const cardsOfType = this.cards
                .filter(c => c.type === type)
                .sort((a, b) => {
                    // Sort by createdAt date, oldest first
                    const dateA = new Date(a.createdAt || 0);
                    const dateB = new Date(b.createdAt || 0);
                    return dateA - dateB;
                });
            
            let nextNumber = 1;
            cardsOfType.forEach(card => {
                if (!card.number || card.number < 1) {
                    card.number = nextNumber;
                }
                nextNumber = Math.max(nextNumber, card.number) + 1;
            });
        });
    }

    // Reorganize numbers when there's a conflict
    reorganizeNumbers(type, newNumber, excludeId = null) {
        const cardsOfType = this.cards
            .filter(c => c.type === type && c.id !== excludeId)
            .sort((a, b) => (a.number || 0) - (b.number || 0));
        
        // Find cards that need to be shifted
        cardsOfType.forEach(card => {
            if (card.number >= newNumber) {
                card.number = card.number + 1;
                card.updatedAt = new Date().toISOString();
            }
        });
    }

    createCard(cardData) {
        // Handle numbering
        if (!cardData.number || cardData.number < 1) {
            cardData.number = this.getNextNumber(cardData.type);
        } else {
            // Check if number already exists for this type
            const existingCard = this.cards.find(
                c => c.type === cardData.type && c.number === cardData.number
            );
            if (existingCard) {
                this.reorganizeNumbers(cardData.type, cardData.number);
            }
        }

        const card = {
            id: this.generateId(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...cardData
        };
        this.cards.push(card);
        return card;
    }

    updateCard(id, cardData) {
        const index = this.cards.findIndex(c => c.id === id);
        if (index !== -1) {
            const existingCard = this.cards[index];
            
            // Handle numbering on update
            if (cardData.number && cardData.number !== existingCard.number) {
                // Check if new number already exists for this type
                const conflictCard = this.cards.find(
                    c => c.type === cardData.type && c.number === cardData.number && c.id !== id
                );
                if (conflictCard) {
                    this.reorganizeNumbers(cardData.type, cardData.number, id);
                }
            } else if (!cardData.number) {
                // Keep existing number if not provided
                cardData.number = existingCard.number;
            }

            this.cards[index] = {
                ...this.cards[index],
                ...cardData,
                updatedAt: new Date().toISOString()
            };
            return this.cards[index];
        }
        return null;
    }

    deleteCard(id) {
        const index = this.cards.findIndex(c => c.id === id);
        if (index !== -1) {
            // Remove references to this card from other cards
            this.cards.forEach(card => {
                if (card.adjacentLocations) {
                    card.adjacentLocations = card.adjacentLocations.filter(loc => loc !== id);
                }
                if (card.presentCharacters) {
                    card.presentCharacters = card.presentCharacters.filter(char => char !== id);
                }
                if (card.bonds) {
                    card.bonds = card.bonds.filter(bond => bond !== id);
                }
            });
            
            this.cards.splice(index, 1);
            return true;
        }
        return false;
    }

    getCard(id) {
        return this.cards.find(c => c.id === id);
    }

    getCardsByType(type) {
        return this.cards.filter(c => c.type === type);
    }

    getAllCards() {
        return this.cards;
    }

    searchCards(query) {
        const lowerQuery = query.toLowerCase();
        return this.cards.filter(card => 
            card.name.toLowerCase().includes(lowerQuery) ||
            (card.description && card.description.toLowerCase().includes(lowerQuery))
        );
    }

    pushToHistory(cardId) {
        this.navigationHistory.push(cardId);
        if (this.navigationHistory.length > 20) {
            this.navigationHistory.shift();
        }
    }

    getLastFromHistory() {
        return this.navigationHistory.pop();
    }
}

// =====================================================
// UI CONTROLLER
// =====================================================

class UIController {
    constructor(dataStore) {
        this.dataStore = dataStore;
        this.currentView = 'cards';
        this.currentCard = null;
        this.currentFilter = 'all';
        this.selectedType = null;
        this.editingCardId = null;
        
        // Carousel state
        this.carouselPositions = {
            eventos: 0,
            locais: 0,
            personagens: 0
        };
        
        // Drag state
        this.dragState = {
            isDragging: false,
            potentialDrag: false,
            hasMoved: false,
            startX: 0,
            currentX: 0,
            track: null,
            startTranslate: 0
        };
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.renderCardsList();
        this.updateWelcomeScreen();
        this.renderCarousels();
        this.initCarouselDrag();
    }

    bindEvents() {
        // Navigation buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                this.showView(view);
            });
        });

        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.currentTarget.dataset.filter;
                this.setFilter(filter);
            });
        });

        // Search input
        document.getElementById('search-cards').addEventListener('input', (e) => {
            this.filterCardsList(e.target.value);
        });

        // Type selection buttons
        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.currentTarget.dataset.type;
                this.selectType(type);
            });
        });

        // Form submission
        document.getElementById('card-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleFormSubmit();
        });

        // Connection selectors
        this.bindConnectionSelectors();

        // Modal overlay click to close
        document.getElementById('modal-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'modal-overlay') {
                this.closeModal();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
                this.closeCardDetail();
            }
        });
    }
    
    initCarouselDrag() {
        const tracks = document.querySelectorAll('.carousel-track');
        
        tracks.forEach(track => {
            // Mouse events
            track.addEventListener('mousedown', (e) => this.startDrag(e, track));
            track.addEventListener('mousemove', (e) => this.onDrag(e));
            track.addEventListener('mouseup', () => this.endDrag());
            track.addEventListener('mouseleave', () => this.endDrag());
            
            // Touch events
            track.addEventListener('touchstart', (e) => this.startDrag(e, track), { passive: true });
            track.addEventListener('touchmove', (e) => this.onDrag(e), { passive: true });
            track.addEventListener('touchend', () => this.endDrag());
        });
    }
    
    startDrag(e, track) {
        // Don't start drag if clicking on a flip card directly
        if (e.target.closest('.flip-card')) {
            this.dragState.potentialDrag = true;
            this.dragState.isDragging = false;
        } else {
            this.dragState.potentialDrag = true;
            this.dragState.isDragging = false;
        }
        
        this.dragState.track = track;
        this.dragState.startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        this.dragState.currentX = this.dragState.startX;
        this.dragState.hasMoved = false;
        
        // Get current translate value
        const transform = window.getComputedStyle(track).transform;
        if (transform !== 'none') {
            const matrix = new DOMMatrix(transform);
            this.dragState.startTranslate = matrix.m41;
        } else {
            this.dragState.startTranslate = 0;
        }
    }
    
    onDrag(e) {
        if (!this.dragState.potentialDrag) return;
        
        const currentX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const diff = Math.abs(currentX - this.dragState.startX);
        
        // Only start actual drag after moving more than 10px
        if (diff > 10 && !this.dragState.isDragging) {
            this.dragState.isDragging = true;
            this.dragState.hasMoved = true;
            this.dragState.track.classList.add('dragging');
        }
        
        if (this.dragState.isDragging) {
            const moveDiff = currentX - this.dragState.startX;
            const newTranslate = this.dragState.startTranslate + moveDiff;
            this.dragState.track.style.transform = `translateX(${newTranslate}px)`;
            this.dragState.currentX = currentX;
        }
    }
    
    endDrag() {
        if (!this.dragState.potentialDrag) return;
        
        const track = this.dragState.track;
        if (track) {
            track.classList.remove('dragging');
        }
        
        // Only process carousel scroll if we actually dragged
        if (this.dragState.isDragging && this.dragState.hasMoved) {
            const diff = this.dragState.currentX - this.dragState.startX;
            const cardWidth = 220 + 24; // card width + gap
            const threshold = 50;
            
            // Get carousel type from track
            const type = track.id.replace('track-', '');
            
            // Determine scroll direction based on drag
            if (Math.abs(diff) > threshold) {
                if (diff > 0) {
                    // Dragged right = go to previous
                    scrollCarousel(type, -1);
                } else {
                    // Dragged left = go to next
                    scrollCarousel(type, 1);
                }
            } else {
                // Snap back to current position
                this.updateCarouselPosition(type);
            }
        }
        
        // Reset drag state
        this.dragState.potentialDrag = false;
        this.dragState.isDragging = false;
        this.dragState.hasMoved = false;
        this.dragState.track = null;
    }
    
    updateCarouselPosition(type) {
        const track = document.getElementById(`track-${type}`);
        const cardWidth = 220 + 24;
        const position = this.carouselPositions[type];
        track.style.transform = `translateX(-${position * cardWidth}px)`;
    }
    
    renderCarousels() {
        const eventos = this.dataStore.getCardsByType('evento');
        const locais = this.dataStore.getCardsByType('local');
        const personagens = this.dataStore.getCardsByType('personagem');
        
        this.renderCarouselTrack('eventos', eventos, 'evento');
        this.renderCarouselTrack('locais', locais, 'local');
        this.renderCarouselTrack('personagens', personagens, 'personagem');
        
        // Show/hide empty states
        document.getElementById('empty-eventos').classList.toggle('visible', eventos.length === 0);
        document.getElementById('empty-locais').classList.toggle('visible', locais.length === 0);
        document.getElementById('empty-personagens').classList.toggle('visible', personagens.length === 0);
        
        // Hide track wrappers if empty
        document.querySelector('#carousel-eventos .carousel-track-wrapper').style.display = eventos.length > 0 ? 'block' : 'none';
        document.querySelector('#carousel-locais .carousel-track-wrapper').style.display = locais.length > 0 ? 'block' : 'none';
        document.querySelector('#carousel-personagens .carousel-track-wrapper').style.display = personagens.length > 0 ? 'block' : 'none';
    }
    
    renderCarouselTrack(trackId, cards, type) {
        const track = document.getElementById(`track-${trackId}`);
        
        if (cards.length === 0) {
            track.innerHTML = '';
            return;
        }
        
        track.innerHTML = cards.map(card => this.createFlipCard(card)).join('');
        
        // Reset position if needed
        if (this.carouselPositions[trackId] >= cards.length) {
            this.carouselPositions[trackId] = Math.max(0, cards.length - 1);
        }
        this.updateCarouselPosition(trackId);
    }
    
    createFlipCard(card) {
        const icon = this.getTypeIcon(card.type);
        const typeName = this.getTypeName(card.type);
        
        // Get meta info
        let metaHtml = '';
        if (card.type === 'personagem') {
            if (card.occupation) {
                metaHtml += `<span class="flip-card-meta-item">${this.escapeHtml(card.occupation)}</span>`;
            }
            if (card.age) {
                metaHtml += `<span class="flip-card-meta-item">${this.escapeHtml(card.age)}</span>`;
            }
        }
        
        // Build card back content based on whether there's an image
        let cardBackContent = '';
        const hasImage = card.image && card.image.length > 0;
        
        // Get image positions (handle legacy)
        let imagePositionX = 50;
        let imagePositionY = 50;
        
        if (card.imagePositionX !== undefined) {
            imagePositionX = card.imagePositionX ?? 50;
            imagePositionY = card.imagePositionY ?? 50;
        } else if (card.imagePosition !== undefined) {
            // Legacy: convert single position to Y
            if (typeof card.imagePosition === 'string') {
                if (card.imagePosition === 'top') imagePositionY = 0;
                else if (card.imagePosition === 'bottom') imagePositionY = 100;
                else imagePositionY = 50;
            } else {
                imagePositionY = card.imagePosition ?? 50;
            }
        }
        
        if (hasImage) {
            cardBackContent = `
                <div class="card-back-image">
                    <img src="${card.image}" alt="${this.escapeHtml(card.name)}" style="object-position: ${imagePositionX}% ${imagePositionY}%;">
                    <div class="card-back-image-overlay"></div>
                </div>
                <div class="card-back-info">
                    <span class="card-back-label">${this.escapeHtml(card.name)}</span>
                </div>
            `;
        } else {
            cardBackContent = `
                <span class="card-back-symbol">${icon}</span>
                <span class="card-back-label">${this.escapeHtml(card.name)}</span>
            `;
        }
        
        return `
            <div class="flip-card" data-card-id="${card.id}" onclick="toggleFlipCard(event, '${card.id}')">
                <div class="flip-card-inner">
                    <!-- Back of card (face down) -->
                    <div class="flip-card-front ${card.type}${hasImage ? ' has-image' : ''}">
                        ${cardBackContent}
                    </div>
                    
                    <!-- Front of card (face up - info) -->
                    <div class="flip-card-back ${card.type}">
                        <div class="flip-card-header ${card.type}">
                            <span class="flip-card-type ${card.type}">${icon} ${typeName}</span>
                            <h3 class="flip-card-title">${this.escapeHtml(card.name)}</h3>
                        </div>
                        <div class="flip-card-body">
                            <p class="flip-card-description">${this.escapeHtml(card.resumo || card.description) || 'Sem descrição'}</p>
                        </div>
                        ${metaHtml ? `<div class="flip-card-meta">${metaHtml}</div>` : ''}
                        <div class="flip-card-footer">
                            <button class="flip-card-action" onclick="openCardDetail(event, '${card.id}')">
                                Ver Detalhes →
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    bindConnectionSelectors() {
        const selectors = [
            { select: 'adjacent-locations-select', container: 'selected-adjacent', type: 'local' },
            { select: 'present-characters-select', container: 'selected-characters', type: 'personagem' },
            { select: 'bonds-select', container: 'selected-bonds', type: 'personagem' }
        ];

        selectors.forEach(({ select, container }) => {
            const selectEl = document.getElementById(select);
            if (selectEl) {
                selectEl.addEventListener('change', (e) => {
                    const cardId = e.target.value;
                    if (cardId) {
                        this.addConnectionTag(cardId, container);
                        e.target.value = '';
                    }
                });
            }
        });
    }

    addConnectionTag(cardId, containerId) {
        const container = document.getElementById(containerId);
        const card = this.dataStore.getCard(cardId);
        
        if (!card) return;
        
        // Check if already added
        if (container.querySelector(`[data-card-id="${cardId}"]`)) return;

        const tag = document.createElement('div');
        tag.className = 'selected-connection';
        tag.dataset.cardId = cardId;
        tag.innerHTML = `
            <span>${card.name}</span>
            <button type="button" class="remove-connection" onclick="ui.removeConnectionTag('${cardId}', '${containerId}')">×</button>
        `;
        container.appendChild(tag);
    }

    removeConnectionTag(cardId, containerId) {
        const container = document.getElementById(containerId);
        const tag = container.querySelector(`[data-card-id="${cardId}"]`);
        if (tag) {
            tag.remove();
        }
    }

    getSelectedConnections(containerId) {
        const container = document.getElementById(containerId);
        return Array.from(container.querySelectorAll('.selected-connection')).map(
            tag => tag.dataset.cardId
        );
    }

    showView(view) {
        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });

        // Update views
        document.querySelectorAll('.view').forEach(v => {
            v.classList.remove('active');
        });
        document.getElementById(`${view}-view`).classList.add('active');

        this.currentView = view;

        if (view === 'cards') {
            if (!this.currentCard) {
                this.updateWelcomeScreen();
            }
        } else if (view === 'create' && !this.editingCardId) {
            // Only reset form if not editing
            this.resetForm();
        }

        // Update breadcrumb
        this.updateBreadcrumb();
        
        // Close mobile menu if open
        closeMobileMenu();
    }

    setFilter(filter) {
        this.currentFilter = filter;
        
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === filter);
        });

        this.renderCardsList();
    }

    filterCardsList(query) {
        const cards = query ? this.dataStore.searchCards(query) : this.dataStore.getAllCards();
        this.renderCardsList(cards);
    }

    renderCardsList(cards = null) {
        const list = document.getElementById('cards-list');
        let filteredCards = cards || this.dataStore.getAllCards();

        if (this.currentFilter !== 'all') {
            filteredCards = filteredCards.filter(c => c.type === this.currentFilter);
        }

        // Sort by type (evento, local, personagem) then by number
        const typeOrder = { 'evento': 1, 'local': 2, 'personagem': 3 };
        filteredCards.sort((a, b) => {
            const aOrder = typeOrder[a.type] || 99;
            const bOrder = typeOrder[b.type] || 99;
            if (aOrder !== bOrder) return aOrder - bOrder;
            return (a.number || 999) - (b.number || 999);
        });

        if (filteredCards.length === 0) {
            list.innerHTML = `
                <li class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <p>Nenhum card encontrado</p>
                </li>
            `;
            return;
        }

        // Group by type and render with category headers
        const typeNames = {
            'evento': { name: 'Eventos', icon: '📅' },
            'local': { name: 'Locais', icon: '🏛' },
            'personagem': { name: 'Personagens', icon: '👤' }
        };

        let html = '';
        let currentType = null;

        filteredCards.forEach(card => {
            // Add category header when type changes
            if (card.type !== currentType && this.currentFilter === 'all') {
                currentType = card.type;
                const typeInfo = typeNames[card.type] || { name: card.type, icon: '📄' };
                html += `
                    <li class="card-list-category ${card.type}">
                        <span class="card-list-category-icon">${typeInfo.icon}</span>
                        ${typeInfo.name}
                    </li>
                `;
            }

            html += `
                <li class="card-list-item ${this.currentCard && this.currentCard.id === card.id ? 'active' : ''}" 
                    onclick="ui.openCard('${card.id}')">
                    <span class="card-number">${card.number || ''}</span>
                    <span class="type-dot ${card.type}"></span>
                    <span class="card-name">${this.escapeHtml(card.name)}</span>
                </li>
            `;
        });

        list.innerHTML = html;
    }

    updateWelcomeScreen() {
        const welcomeScreen = document.getElementById('welcome-screen');
        const carouselContainer = document.getElementById('carousel-container');
        
        const hasCards = this.dataStore.getAllCards().length > 0;
        
        if (hasCards) {
            welcomeScreen.style.display = 'none';
            carouselContainer.classList.add('active');
            this.renderCarousels();
        } else {
            welcomeScreen.style.display = 'flex';
            carouselContainer.classList.remove('active');
        }
    }

    openCard(cardId, animation = 'default') {
        const card = this.dataStore.getCard(cardId);
        if (!card) return;

        // Push current card to history before navigating
        if (this.currentCard) {
            this.dataStore.pushToHistory(this.currentCard.id);
        }

        this.currentCard = card;
        this.showView('cards');
        this.renderCardDetail(card);
        this.renderCardsList();
        this.updateBreadcrumb();
        
        // Close mobile menu if open
        closeMobileMenu();
    }

    // =========================================
    // RENDER CARD - PURE NODE STRUCTURE
    // =========================================
    renderCardDetail(card) {
        const overlay = document.getElementById('card-detail-overlay');
        const container = document.getElementById('card-detail-container');

        const hasImage = card.image && card.image.length > 0;
        const posX = card.imagePositionX ?? 50;
        const posY = card.imagePositionY ?? 50;
        
        // Build nodes from card data (legacy support + new format)
        const nodes = card.nodes || this.buildNodesFromLegacy(card);
        
        let html = `
            <div class="flowchart-card">
                <div class="flowchart-header">
                    ${hasImage ? `<img class="flowchart-image" src="${card.image}" style="object-position:${posX}% ${posY}%">` : ''}
                    <div class="flowchart-header-overlay"></div>
                    <div class="flowchart-actions">
                        <button class="fc-btn" onclick="ui.editCard('${card.id}')">✎</button>
                        <button class="fc-btn del" onclick="ui.confirmDeleteCard('${card.id}')">🗑</button>
                        <button class="fc-btn close" onclick="closeCardDetail()">×</button>
                    </div>
                    <div class="flowchart-title">
                        <span class="fc-type ${card.type}">${this.getTypeIcon(card.type)}</span>
                        <h1>${this.escapeHtml(card.name)}</h1>
                    </div>
                </div>
                <div class="flowchart-body">
                    ${this.renderFlowchart(nodes, card)}
                </div>
            </div>
        `;

        container.innerHTML = html;
        overlay.classList.add('active');
    }
    
    // =========================================
    // FLOWCHART RENDERER - PURE NODES
    // =========================================
    renderFlowchart(nodes, card) {
        if (!nodes || nodes.length === 0) {
            return '<div class="fc-empty">Sem nós definidos</div>';
        }
        
        let html = '<div class="fc-flow">';
        
        nodes.forEach((node, i) => {
            const isLast = i === nodes.length - 1;
            html += this.renderNode(node, card, isLast);
        });
        
        // Add connection nodes at end
        html += this.renderConnectionNodes(card);
        
        html += '</div>';
        return html;
    }
    
    renderNode(node, card, isLast) {
        const typeClass = node.type || 'default';
        const hasChildren = node.children && node.children.length > 0;
        const hasLink = node.linkTo;
        
        let html = `<div class="fc-node ${typeClass}${hasLink ? ' clickable' : ''}"${hasLink ? ` onclick="ui.openCard('${hasLink}')"` : ''}>`;
        html += `<span class="fc-dot"></span>`;
        html += `<span class="fc-label">${this.escapeHtml(this.truncate(node.label, 120))}</span>`;
        if (hasLink) html += `<span class="fc-arrow">→</span>`;
        html += `</div>`;
        
        // Render children as branches
        if (hasChildren) {
            html += '<div class="fc-branches">';
            node.children.forEach(child => {
                html += this.renderBranch(child, card);
            });
            html += '</div>';
        }
        
        // Connector line (unless last)
        if (!isLast || hasChildren) {
            html += '<div class="fc-connector"></div>';
        }
        
        return html;
    }
    
    renderBranch(node, card) {
        const typeClass = node.type || 'branch';
        const hasLink = node.linkTo;
        const linkedCard = hasLink ? this.dataStore.getCard(hasLink) : null;
        
        let html = `<div class="fc-branch ${typeClass}${hasLink ? ' clickable' : ''}"${hasLink ? ` onclick="ui.openCard('${hasLink}')"` : ''}>`;
        html += `<span class="fc-branch-line">→</span>`;
        html += `<span class="fc-branch-label">${this.escapeHtml(this.truncate(node.label, 120))}</span>`;
        if (linkedCard) {
            html += `<span class="fc-link-icon">${this.getTypeIcon(linkedCard.type)}</span>`;
        }
        html += `</div>`;
        
        return html;
    }
    
    renderConnectionNodes(card) {
        const connections = this.gatherAllConnections(card);
        if (connections.length === 0) return '';
        
        let html = '<div class="fc-connections">';
        html += '<div class="fc-conn-label">↓ Conexões</div>';
        
        connections.forEach(conn => {
            html += `
                <div class="fc-conn ${conn.type}" onclick="ui.openCard('${conn.id}')">
                    <span class="fc-conn-icon">${this.getTypeIcon(conn.type)}</span>
                    <span class="fc-conn-name">${this.escapeHtml(conn.name)}</span>
                    <span class="fc-conn-rel">${conn.relation}</span>
                </div>
            `;
        });
        
        html += '</div>';
        return html;
    }
    
    // =========================================
    // BUILD NODES FROM LEGACY DATA
    // =========================================
    buildNodesFromLegacy(card) {
        const nodes = [];
        
        if (card.type === 'evento') {
            // Trigger
            if (card.resumo) {
                nodes.push({ type: 'trigger', label: this.extractShort(card.resumo) });
            }
            // States from description
            this.extractItems(card.description).forEach(item => {
                nodes.push({ type: 'state', label: item });
            });
            // Consequences as branches
            const conseq = this.extractItems(card.consequences);
            if (conseq.length > 0) {
                nodes.push({ 
                    type: 'condition', 
                    label: 'Consequências',
                    children: conseq.map(c => ({ type: 'consequence', label: c }))
                });
            }
            // Hooks as branches
            const hooks = this.extractItems(card.hooks);
            if (hooks.length > 0) {
                nodes.push({
                    type: 'condition',
                    label: 'Desdobramentos',
                    children: hooks.map(h => ({ type: 'action', label: h }))
                });
            }
        } else if (card.type === 'local') {
            // Entry
            if (card.resumo) {
                nodes.push({ type: 'trigger', label: this.extractShort(card.resumo) });
            }
            // Areas from description
            this.extractItems(card.description).forEach(item => {
                nodes.push({ type: 'state', label: item });
            });
            // Atmosphere
            if (card.atmosfera) {
                nodes.push({ type: 'condition', label: this.extractShort(card.atmosfera) });
            }
            // Secrets as branches
            const secrets = this.extractItems(card.segredos);
            if (secrets.length > 0) {
                nodes.push({
                    type: 'condition',
                    label: 'Pistas',
                    children: secrets.map(s => ({ type: 'secret', label: s }))
                });
            }
        } else if (card.type === 'personagem') {
            // Identity
            if (card.occupation || card.race || card.age) {
                const parts = [card.occupation, card.race, card.age].filter(Boolean);
                nodes.push({ type: 'state', label: parts.join(' · ') });
            }
            // Traits from personality
            const traits = this.extractItems(card.personality);
            if (traits.length > 0) {
                nodes.push({
                    type: 'condition',
                    label: 'Comportamento',
                    children: traits.map(t => ({ type: 'trait', label: t }))
                });
            }
            // Skills
            const skills = this.extractItems(card.stats);
            if (skills.length > 0) {
                nodes.push({
                    type: 'condition',
                    label: 'Capacidades',
                    children: skills.map(s => ({ type: 'action', label: s }))
                });
            }
            // Secrets
            const secrets = this.extractItems(card.secrets);
            if (secrets.length > 0) {
                nodes.push({
                    type: 'condition',
                    label: 'Segredos',
                    children: secrets.map(s => ({ type: 'secret', label: s }))
                });
            }
        }
        
        return nodes;
    }
    
    // =========================================
    // TEXT EXTRACTION (max 120 chars)
    // =========================================
    extractShort(text) {
        if (!text) return '';
        const clean = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        return clean.length > 120 ? clean.substring(0, 117) + '...' : clean;
    }
    
    extractItems(text) {
        if (!text) return [];
        const clean = text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        // Split by sentences, bullets, or newlines
        let items = clean.split(/[.!?]\s+|[\n\r]+|(?:^|\s)[-•*→]\s*/);
        return items
            .map(s => s.trim())
            .filter(s => s.length > 3 && s.length <= 120)
            .slice(0, 6);
    }
    
    truncate(text, max = 120) {
        if (!text) return '';
        return text.length > max ? text.substring(0, max - 3) + '...' : text;
    }
    
    // =========================================
    // LEGACY COMPAT - CASCADE FUNCTIONS
    // =========================================
    renderEventCascade(card) { return ''; }
    renderLocationCascade(card) { return ''; }
    renderCharacterCascade(card) { return ''; }
    renderNodes(nodes) { return ''; }
    renderDestinations(card) { return this.renderConnectionNodes(card); }
    
    gatherAllConnections(card) {
        const connections = [];
        
        const addConnections = (ids, relation) => {
            if (!ids || ids.length === 0) return;
            ids.forEach(id => {
                const c = this.dataStore.getCard(id);
                if (c) connections.push({ id: c.id, name: c.name, type: c.type, relation });
            });
        };
        
        if (card.type === 'evento') {
            addConnections(card.relatedLocations, 'Local');
            addConnections(card.relatedCharacters, 'Personagem');
        } else if (card.type === 'local') {
            addConnections(card.adjacentLocations, 'Adjacente');
            addConnections(card.presentCharacters, 'Presente');
            addConnections(card.relatedEvents, 'Evento');
        } else if (card.type === 'personagem') {
            addConnections(card.bonds, 'Vínculo');
            addConnections(card.presentLocations, 'Frequenta');
            addConnections(card.relatedEvents, 'Evento');
        }
        
        return connections;
    }
    
    splitIntoNodes(text) { return this.extractItems(text); }
    getFirstSentence(text) { return this.extractShort(text); }
    stripHtml(html) {
        if (!html) return '';
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    renderCard(card, animation = 'default') {
        this.renderCardDetail(card);
    }

    // Legacy compatibility
    renderEventContent(card) { return ''; }
    renderLocationContent(card) { return ''; }
    renderCharacterContent(card) { return ''; }
    renderSectionBlock() { return ''; }
    renderListSection() { return ''; }
    renderConnectionsSection(card) { return ''; }
    gatherConnections(card) { return this.gatherAllConnections(card); }
    parseTextToList(text) { return this.extractItems(text); }
    parseTextToItems(text) { return this.extractItems(text); }

    selectType(type) {
        this.selectedType = type;

        // Update type buttons
        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });

        // Show common fields
        document.getElementById('common-fields').style.display = 'block';
        document.getElementById('form-actions').style.display = 'flex';
        
        // Show cascade editor
        document.getElementById('cascade-editor-section').style.display = 'block';
        document.getElementById('connections-section').style.display = 'block';

        // Update number placeholder to show next available number
        const nextNumber = this.dataStore.getNextNumber(type);
        document.getElementById('card-number').placeholder = nextNumber;

        // Hide all type-specific fields (legacy)
        document.querySelectorAll('.type-fields').forEach(el => {
            el.style.display = 'none';
        });

        // Reset cascade editor
        cascadeNodes = [];
        renderCascadeNodes();
        
        // Populate connection selector
        this.populateConnectionSelect();
    }
    
    populateConnectionSelect() {
        const select = document.getElementById('connection-select');
        if (!select) return;
        
        const allCards = this.dataStore.getAllCards()
            .filter(c => !this.editingCardId || c.id !== this.editingCardId);
        
        select.innerHTML = `
            <option value="">+ Conectar card...</option>
            ${allCards.map(card => `
                <option value="${card.id}" data-type="${card.type}">${this.getTypeIcon(card.type)} ${this.escapeHtml(card.name)}</option>
            `).join('')}
        `;
    }

    populateConnectionSelectors() {
        // Adjacent locations (only other locations)
        const adjacentSelect = document.getElementById('adjacent-locations-select');
        if (adjacentSelect) {
            const locations = this.dataStore.getCardsByType('local')
                .filter(c => !this.editingCardId || c.id !== this.editingCardId);
            adjacentSelect.innerHTML = `
                <option value="">+ Adicionar local adjacente...</option>
                ${locations.map(loc => `
                    <option value="${loc.id}">${this.escapeHtml(loc.name)}</option>
                `).join('')}
            `;
        }

        // Present characters
        const charactersSelect = document.getElementById('present-characters-select');
        if (charactersSelect) {
            const characters = this.dataStore.getCardsByType('personagem');
            charactersSelect.innerHTML = `
                <option value="">+ Adicionar personagem...</option>
                ${characters.map(char => `
                    <option value="${char.id}">${this.escapeHtml(char.name)}</option>
                `).join('')}
            `;
        }

        // Bonds
        const bondsSelect = document.getElementById('bonds-select');
        if (bondsSelect) {
            const characters = this.dataStore.getCardsByType('personagem')
                .filter(c => !this.editingCardId || c.id !== this.editingCardId);
            bondsSelect.innerHTML = `
                <option value="">+ Adicionar vínculo...</option>
                ${characters.map(char => `
                    <option value="${char.id}">${this.escapeHtml(char.name)}</option>
                `).join('')}
            `;
        }
    }

    handleFormSubmit() {
        const name = document.getElementById('card-name').value.trim();
        const resumo = document.getElementById('card-resumo').value.trim();
        
        if (!this.selectedType) {
            this.showToast('Selecione um tipo de card', 'error');
            return;
        }

        if (!name) {
            this.showToast('Digite um nome para o card', 'error');
            return;
        }

        // Get image data
        const imageData = getCardImageData();

        // Get card number
        const numberInput = document.getElementById('card-number').value;
        const cardNumber = numberInput ? parseInt(numberInput, 10) : null;

        // Get cascade nodes
        const nodes = cascadeNodes.map(n => ({
            type: n.type,
            label: n.label,
            children: n.children || []
        }));
        
        // Get connections
        const connections = cardConnections.slice();

        const cardData = {
            type: this.selectedType,
            resumo: resumo,
            name: name,
            number: cardNumber,
            nodes: nodes,
            image: imageData.image,
            imagePositionX: imageData.imagePositionX,
            imagePositionY: imageData.imagePositionY
        };

        // Add connections based on type
        if (this.selectedType === 'evento') {
            cardData.relatedLocations = connections.filter(c => {
                const card = this.dataStore.getCard(c);
                return card && card.type === 'local';
            });
            cardData.relatedCharacters = connections.filter(c => {
                const card = this.dataStore.getCard(c);
                return card && card.type === 'personagem';
            });
        } else if (this.selectedType === 'local') {
            cardData.adjacentLocations = connections.filter(c => {
                const card = this.dataStore.getCard(c);
                return card && card.type === 'local';
            });
            cardData.presentCharacters = connections.filter(c => {
                const card = this.dataStore.getCard(c);
                return card && card.type === 'personagem';
            });
            cardData.relatedEvents = connections.filter(c => {
                const card = this.dataStore.getCard(c);
                return card && card.type === 'evento';
            });
        } else if (this.selectedType === 'personagem') {
            cardData.bonds = connections.filter(c => {
                const card = this.dataStore.getCard(c);
                return card && card.type === 'personagem';
            });
            cardData.presentLocations = connections.filter(c => {
                const card = this.dataStore.getCard(c);
                return card && card.type === 'local';
            });
            cardData.relatedEvents = connections.filter(c => {
                const card = this.dataStore.getCard(c);
                return card && card.type === 'evento';
            });
        }

        let card;
        let previousConnections = null;
        
        // Store previous connections if editing (to handle removed connections)
        if (this.editingCardId) {
            const existingCard = this.dataStore.getCard(this.editingCardId);
            if (existingCard) {
                previousConnections = {
                    relatedLocations: existingCard.relatedLocations || [],
                    relatedCharacters: existingCard.relatedCharacters || [],
                    adjacentLocations: existingCard.adjacentLocations || [],
                    presentCharacters: existingCard.presentCharacters || [],
                    bonds: existingCard.bonds || []
                };
            }
            card = this.dataStore.updateCard(this.editingCardId, cardData);
            this.showToast('Card atualizado com sucesso!', 'success');
        } else {
            card = this.dataStore.createCard(cardData);
            this.showToast('Card criado com sucesso!', 'success');
        }
        
        // Handle mutual connections
        this.updateMutualConnections(card, cardData, previousConnections);

        this.renderCardsList();
        this.renderCarousels();
        this.showView('cards');
        this.updateWelcomeScreen();
        this.resetForm();
    }
    
    // Update mutual connections when a card is saved
    updateMutualConnections(card, cardData, previousConnections) {
        const cardId = card.id;
        const cardType = card.type;
        
        // Define connection mappings based on card type
        // Format: { fieldInThisCard: { targetType: fieldInTargetCard } }
        const connectionMappings = {
            evento: {
                relatedLocations: { targetField: 'relatedEvents', targetTypes: ['local'] },
                relatedCharacters: { targetField: 'relatedEvents', targetTypes: ['personagem'] }
            },
            local: {
                adjacentLocations: { targetField: 'adjacentLocations', targetTypes: ['local'] },
                presentCharacters: { targetField: 'presentLocations', targetTypes: ['personagem'] }
            },
            personagem: {
                bonds: { targetField: 'bonds', targetTypes: ['personagem'] }
            }
        };
        
        const mappings = connectionMappings[cardType];
        if (!mappings) return;
        
        // Process each connection field
        Object.entries(mappings).forEach(([fieldName, config]) => {
            const currentConnections = cardData[fieldName] || [];
            const previousConns = previousConnections ? (previousConnections[fieldName] || []) : [];
            
            // Find added connections
            const addedConnections = currentConnections.filter(id => !previousConns.includes(id));
            
            // Find removed connections
            const removedConnections = previousConns.filter(id => !currentConnections.includes(id));
            
            // Add mutual connection to newly connected cards
            addedConnections.forEach(targetId => {
                this.addMutualConnection(targetId, cardId, config.targetField, cardType);
            });
            
            // Remove mutual connection from disconnected cards
            removedConnections.forEach(targetId => {
                this.removeMutualConnection(targetId, cardId, config.targetField);
            });
        });
    }
    
    // Add a mutual connection to a target card
    addMutualConnection(targetCardId, sourceCardId, targetField, sourceType) {
        const targetCard = this.dataStore.getCard(targetCardId);
        if (!targetCard) return;
        
        // Determine which field to use based on target card type and source type
        let fieldToUpdate = targetField;
        
        // Special handling for different card type combinations
        if (targetCard.type === 'local') {
            if (sourceType === 'evento') {
                fieldToUpdate = 'relatedEvents';
            } else if (sourceType === 'local') {
                fieldToUpdate = 'adjacentLocations';
            } else if (sourceType === 'personagem') {
                fieldToUpdate = 'presentCharacters';
            }
        } else if (targetCard.type === 'personagem') {
            if (sourceType === 'evento') {
                fieldToUpdate = 'relatedEvents';
            } else if (sourceType === 'local') {
                fieldToUpdate = 'presentLocations';
            } else if (sourceType === 'personagem') {
                fieldToUpdate = 'bonds';
            }
        } else if (targetCard.type === 'evento') {
            if (sourceType === 'local') {
                fieldToUpdate = 'relatedLocations';
            } else if (sourceType === 'personagem') {
                fieldToUpdate = 'relatedCharacters';
            }
        }
        
        // Initialize array if doesn't exist
        if (!targetCard[fieldToUpdate]) {
            targetCard[fieldToUpdate] = [];
        }
        
        // Add connection if not already present
        if (!targetCard[fieldToUpdate].includes(sourceCardId)) {
            targetCard[fieldToUpdate].push(sourceCardId);
            this.dataStore.updateCard(targetCardId, { [fieldToUpdate]: targetCard[fieldToUpdate] });
        }
    }
    
    // Remove a mutual connection from a target card
    removeMutualConnection(targetCardId, sourceCardId, targetField) {
        const targetCard = this.dataStore.getCard(targetCardId);
        if (!targetCard) return;
        
        // Check all possible connection fields
        const connectionFields = [
            'relatedLocations', 'relatedCharacters', 'relatedEvents',
            'adjacentLocations', 'presentCharacters', 'presentLocations',
            'bonds'
        ];
        
        connectionFields.forEach(field => {
            if (targetCard[field] && targetCard[field].includes(sourceCardId)) {
                targetCard[field] = targetCard[field].filter(id => id !== sourceCardId);
                this.dataStore.updateCard(targetCardId, { [field]: targetCard[field] });
            }
        });
    }

    editCard(cardId) {
        const card = this.dataStore.getCard(cardId);
        if (!card) return;

        this.editingCardId = cardId;
        this.showView('create');

        // Update form title
        document.getElementById('form-title').textContent = 'Editar Card';
        document.getElementById('submit-text').textContent = 'Salvar Alterações';

        // Set type
        this.selectType(card.type);

        // Populate common fields
        document.getElementById('card-name').value = card.name || '';
        document.getElementById('card-number').value = card.number || '';
        document.getElementById('card-resumo').value = card.resumo || '';
        
        // Update character counter
        const charCount = document.getElementById('resumo-char-count');
        if (charCount) {
            const length = (card.resumo || '').length;
            charCount.textContent = length;
            if (length > 150) {
                charCount.style.color = 'var(--color-evento)';
            } else if (length > 120) {
                charCount.style.color = 'var(--color-accent)';
            } else {
                charCount.style.color = '';
            }
        }
        
        // Load image data
        if (card.imagePositionX !== undefined) {
            setCardImageData(card.image, card.imagePositionX, card.imagePositionY);
        } else {
            setCardImageData(card.image, card.imagePosition);
        }

        // Load cascade nodes
        if (card.nodes && card.nodes.length > 0) {
            cascadeNodes = JSON.parse(JSON.stringify(card.nodes)); // Deep copy
        } else {
            // Build from legacy data
            cascadeNodes = this.buildNodesFromLegacy(card);
        }
        renderCascadeNodes();
        
        // Load connections
        const allConnections = [];
        if (card.relatedLocations) allConnections.push(...card.relatedLocations);
        if (card.relatedCharacters) allConnections.push(...card.relatedCharacters);
        if (card.adjacentLocations) allConnections.push(...card.adjacentLocations);
        if (card.presentCharacters) allConnections.push(...card.presentCharacters);
        if (card.relatedEvents) allConnections.push(...card.relatedEvents);
        if (card.bonds) allConnections.push(...card.bonds);
        if (card.presentLocations) allConnections.push(...card.presentLocations);
        
        // Remove duplicates
        setConnections([...new Set(allConnections)]);
        
        this.populateConnectionSelect();
        
        // Open accordions that have content
        setTimeout(() => {
            if (card.resumo) openAccordionBySection('resumo');
            if (card.description) openAccordionBySection('descricao');
            if (card.notas) openAccordionBySection('notas');
            if (card.tags && card.tags.length > 0) openAccordionBySection('tags');
        }, 100);
    }

    confirmDeleteCard(cardId) {
        const card = this.dataStore.getCard(cardId);
        if (!card) return;

        const confirmed = confirm(`Tem certeza que deseja excluir "${card.name}"?\n\nEsta ação não pode ser desfeita.`);
        
        if (confirmed) {
            // Remove mutual connections from other cards before deleting
            this.removeAllMutualConnections(card);
            
            this.dataStore.deleteCard(cardId);
            this.showToast('Card excluído', 'info');
            this.currentCard = null;
            closeCardDetail();
            this.renderCardsList();
            this.renderCarousels();
            this.updateWelcomeScreen();
            this.updateBreadcrumb();
        }
    }
    
    // Remove all mutual connections when a card is deleted
    removeAllMutualConnections(card) {
        const cardId = card.id;
        
        // All possible connection fields
        const connectionFields = [
            'relatedLocations', 'relatedCharacters', 'relatedEvents',
            'adjacentLocations', 'presentCharacters', 'presentLocations',
            'bonds'
        ];
        
        // For each connection field in this card
        connectionFields.forEach(field => {
            const connections = card[field] || [];
            connections.forEach(targetId => {
                this.removeMutualConnection(targetId, cardId, null);
            });
        });
    }

    resetForm() {
        this.editingCardId = null;
        this.selectedType = null;

        document.getElementById('form-title').textContent = 'Criar Novo Card';
        document.getElementById('submit-text').textContent = 'Criar Card';

        // Reset type buttons
        document.querySelectorAll('.type-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        // Hide fields
        document.getElementById('common-fields').style.display = 'none';
        document.getElementById('form-actions').style.display = 'none';
        document.getElementById('cascade-editor-section').style.display = 'none';
        document.getElementById('connections-section').style.display = 'none';
        document.querySelectorAll('.type-fields').forEach(el => {
            el.style.display = 'none';
        });

        // Clear all inputs
        document.getElementById('card-form').reset();
        
        // Reset character counter
        const charCount = document.getElementById('resumo-char-count');
        if (charCount) {
            charCount.textContent = '0';
            charCount.style.color = '';
        }

        // Clear image data
        clearCardImageData();
        
        // Reset cascade editor
        resetCascadeEditor();
    }

    updateBreadcrumb() {
        // Breadcrumb removed - function kept for compatibility
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let icon = 'ℹ';
        if (type === 'success') icon = '✓';
        else if (type === 'error') icon = '✕';

        toast.innerHTML = `
            <span class="toast-icon">${icon}</span>
            <span class="toast-message">${this.escapeHtml(message)}</span>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    closeModal() {
        document.getElementById('modal-overlay').classList.remove('active');
    }

    getTypeIcon(type) {
        const icons = {
            evento: '⚡',
            local: '🏛',
            personagem: '👤'
        };
        return icons[type] || '◇';
    }

    getTypeName(type) {
        const names = {
            evento: 'Evento',
            local: 'Local',
            personagem: 'Personagem'
        };
        return names[type] || type;
    }

    formatText(text) {
        if (!text) return '';
        return text.split('\n').map(line => 
            `<p>${this.escapeHtml(line) || '&nbsp;'}</p>`
        ).join('');
    }

    formatRichText(html) {
        if (!html) return '';
        
        // Process card links to make them clickable
        let processed = html.replace(
            /<span class="card-link([^"]*)"[^>]*data-card-id="([^"]+)"[^>]*>([^<]*)<\/span>/g,
            (match, classes, cardId, text) => {
                const card = this.dataStore.getCard(cardId);
                if (card) {
                    return `<span class="card-link ${card.type}" onclick="ui.openCard('${cardId}')">${this.escapeHtml(text)}</span>`;
                }
                return text;
            }
        );
        
        // Process text tags with linked cards - preserve all data attributes
        processed = processed.replace(
            /<span\s+class="text-tag([^"]*)"([^>]*)data-card-id="([^"]+)"([^>]*)>([^<]*)<\/span>/g,
            (match, classes, attrsBefore, cardId, attrsAfter, text) => {
                const allAttrs = attrsBefore + attrsAfter;
                return `<span class="text-tag${classes}" ${allAttrs} data-card-id="${cardId}" onclick="ui.openCard('${cardId}')">${text}</span>`;
            }
        );
        
        // Process dice roll tags - make them clickable
        processed = processed.replace(
            /<span\s+class="dice-roll-tag"([^>]*)data-formula="([^"]+)"([^>]*)data-name="([^"]+)"([^>]*)>/g,
            (match, before, formula, middle, name, after) => {
                return `<span class="dice-roll-tag" ${before} data-formula="${formula}" ${middle} data-name="${name}" ${after} onclick="executeDiceRoll('${name.replace(/'/g, "\\'")}', '${formula}')">`;
            }
        );
        
        return processed;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// =====================================================
// GLOBAL FUNCTIONS
// =====================================================

let dataStore;
let ui;

function initApp() {
    dataStore = new DataStore();
    ui = new UIController(dataStore);
    initImageUpload();
    
    // Ensure all existing cards have numbers (for legacy data)
    dataStore.ensureAllCardsHaveNumbers();
}

function showView(view) {
    ui.showView(view);
}

function goHome() {
    ui.currentCard = null;
    ui.showView('cards');
    ui.updateWelcomeScreen();
    ui.updateBreadcrumb();
}

function resetForm() {
    ui.resetForm();
    ui.showView('cards');
}

// Mobile menu functions
function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const toggle = document.getElementById('mobile-menu-toggle');
    
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
    
    // Update button icon
    if (sidebar.classList.contains('open')) {
        toggle.textContent = '✕';
    } else {
        toggle.textContent = '☰';
    }
}

function closeMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const toggle = document.getElementById('mobile-menu-toggle');
    
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    toggle.textContent = '☰';
}

// Carousel functions
function scrollCarousel(type, direction) {
    const track = document.getElementById(`track-${type}`);
    const cards = track.querySelectorAll('.flip-card');
    
    if (cards.length === 0) return;
    
    const cardWidth = 220 + 24; // card width + gap
    const visibleCards = Math.floor(track.parentElement.offsetWidth / cardWidth) || 1;
    const maxPosition = Math.max(0, cards.length - visibleCards);
    
    let newPosition = ui.carouselPositions[type] + direction;
    newPosition = Math.max(0, Math.min(newPosition, maxPosition));
    
    ui.carouselPositions[type] = newPosition;
    track.style.transform = `translateX(-${newPosition * cardWidth}px)`;
}

function toggleFlipCard(event, cardId) {
    // Don't flip if clicking action button
    if (event.target.closest('.flip-card-action')) return;
    
    // Don't flip if we actually dragged (moved the carousel)
    if (ui.dragState.hasMoved) return;
    
    const card = document.querySelector(`.flip-card[data-card-id="${cardId}"]`);
    if (card) {
        card.classList.toggle('flipped');
    }
}

function openCardDetail(event, cardId) {
    event.stopPropagation();
    ui.openCard(cardId);
}

function closeCardDetail(event) {
    if (event && event.target !== event.currentTarget) return;
    
    const overlay = document.getElementById('card-detail-overlay');
    overlay.classList.remove('active');
    ui.currentCard = null;
    ui.updateBreadcrumb();
    ui.renderCardsList();
}

function selectTypeFromCarousel(type) {
    // Small delay to let the view change first
    setTimeout(() => {
        ui.selectType(type);
    }, 100);
}

function exportCards() {
    const cards = dataStore.getAllCards();
    
    if (cards.length === 0) {
        ui.showToast('Nenhum card para exportar', 'error');
        return;
    }
    
    const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        cards: cards
    };
    
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `narrative-cards-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    ui.showToast(`${cards.length} cards exportados com sucesso!`, 'success');
}

function importCards(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            if (!data.cards || !Array.isArray(data.cards)) {
                throw new Error('Formato de arquivo inválido');
            }
            
            const existingIds = dataStore.getAllCards().map(c => c.id);
            let imported = 0;
            let skipped = 0;
            
            // Create a mapping for old IDs to new IDs
            const idMapping = {};
            
            // First pass: create all cards with new IDs
            data.cards.forEach(card => {
                const oldId = card.id;
                const newId = dataStore.generateId();
                idMapping[oldId] = newId;
            });
            
            // Second pass: import cards with updated references
            data.cards.forEach(card => {
                const newCard = { ...card };
                newCard.id = idMapping[card.id];
                
                // Update connection references
                if (newCard.adjacentLocations) {
                    newCard.adjacentLocations = newCard.adjacentLocations
                        .map(id => idMapping[id] || id)
                        .filter(id => id);
                }
                if (newCard.presentCharacters) {
                    newCard.presentCharacters = newCard.presentCharacters
                        .map(id => idMapping[id] || id)
                        .filter(id => id);
                }
                if (newCard.bonds) {
                    newCard.bonds = newCard.bonds
                        .map(id => idMapping[id] || id)
                        .filter(id => id);
                }
                // New event-specific fields
                if (newCard.relatedLocations) {
                    newCard.relatedLocations = newCard.relatedLocations
                        .map(id => idMapping[id] || id)
                        .filter(id => id);
                }
                if (newCard.relatedCharacters) {
                    newCard.relatedCharacters = newCard.relatedCharacters
                        .map(id => idMapping[id] || id)
                        .filter(id => id);
                }
                // Update card IDs in rich text content
                if (newCard.description) {
                    newCard.description = updateCardIdsInContent(newCard.description, idMapping);
                }
                if (newCard.consequences) {
                    newCard.consequences = updateCardIdsInContent(newCard.consequences, idMapping);
                }
                if (newCard.hooks) {
                    newCard.hooks = updateCardIdsInContent(newCard.hooks, idMapping);
                }
                
                // Assign number if not present
                if (!newCard.number) {
                    newCard.number = dataStore.getNextNumber(newCard.type);
                }
                
                newCard.createdAt = new Date().toISOString();
                newCard.updatedAt = new Date().toISOString();
                
                dataStore.cards.push(newCard);
                imported++;
            });
            
            // Ensure all cards have proper numbers
            dataStore.ensureAllCardsHaveNumbers();
            
            ui.renderCardsList();
            ui.renderCarousels();
            ui.updateWelcomeScreen();
            
            ui.showToast(`${imported} cards importados com sucesso!`, 'success');
            
        } catch (error) {
            console.error('Import error:', error);
            ui.showToast('Erro ao importar: arquivo inválido', 'error');
        }
    };
    
    reader.onerror = function() {
        ui.showToast('Erro ao ler o arquivo', 'error');
    };
    
    reader.readAsText(file);
    
    // Reset input so the same file can be selected again
    event.target.value = '';
}

// Helper function to update card IDs in rich text content
function updateCardIdsInContent(content, idMapping) {
    if (!content) return content;
    
    // Update data-card-id attributes
    return content.replace(/data-card-id="([^"]+)"/g, (match, oldId) => {
        const newId = idMapping[oldId];
        return newId ? `data-card-id="${newId}"` : match;
    });
}

// =====================================================
// IMAGE UPLOAD FUNCTIONS
// =====================================================

let currentCardImage = null;
let currentImagePositionX = 50; // Percentage (0-100), 50 = center
let currentImagePositionY = 50; // Percentage (0-100), 50 = center

// Drag state for image positioning
let imageDragState = {
    isDragging: false,
    startX: 0,
    startY: 0,
    startPositionX: 50,
    startPositionY: 50
};

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
        ui.showToast('Por favor, selecione um arquivo de imagem', 'error');
        return;
    }
    
    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        ui.showToast('A imagem deve ter no máximo 5MB', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        currentCardImage = e.target.result;
        currentImagePositionX = 50; // Reset to center for new image
        currentImagePositionY = 50;
        showImagePreview(currentCardImage);
    };
    reader.readAsDataURL(file);
}

function showImagePreview(imageSrc) {
    const preview = document.getElementById('image-preview');
    const previewImg = document.getElementById('preview-img');
    const placeholder = document.getElementById('image-placeholder');
    const removeBtn = document.getElementById('remove-image-btn');
    const positionControls = document.getElementById('image-position-controls');
    const nameBar = document.getElementById('preview-name-bar');
    
    previewImg.src = imageSrc;
    previewImg.style.display = 'block';
    previewImg.style.objectPosition = `${currentImagePositionX}% ${currentImagePositionY}%`;
    placeholder.style.display = 'none';
    removeBtn.style.display = 'flex';
    positionControls.style.display = 'block';
    nameBar.style.display = 'flex';
    preview.classList.add('has-image');
    
    // Update name in preview
    updatePreviewName();
}

function hideImagePreview() {
    const preview = document.getElementById('image-preview');
    const previewImg = document.getElementById('preview-img');
    const placeholder = document.getElementById('image-placeholder');
    const removeBtn = document.getElementById('remove-image-btn');
    const positionControls = document.getElementById('image-position-controls');
    const nameBar = document.getElementById('preview-name-bar');
    
    previewImg.src = '';
    previewImg.style.display = 'none';
    previewImg.style.objectPosition = '';
    placeholder.style.display = 'flex';
    removeBtn.style.display = 'none';
    positionControls.style.display = 'none';
    nameBar.style.display = 'none';
    preview.classList.remove('has-image');
}

function removeCardImage() {
    currentCardImage = null;
    currentImagePositionX = 50;
    currentImagePositionY = 50;
    hideImagePreview();
    document.getElementById('card-image').value = '';
}

function initImageUpload() {
    const preview = document.getElementById('image-preview');
    const fileInput = document.getElementById('card-image');
    const previewImg = document.getElementById('preview-img');
    const nameInput = document.getElementById('card-name');
    
    // Click on preview to trigger file upload (only when no image)
    preview.addEventListener('click', (e) => {
        // Don't trigger if clicking on remove button or if dragging
        if (e.target.id === 'remove-image-btn' || e.target.closest('#remove-image-btn')) {
            return;
        }
        // Only open file picker if no image yet
        if (!preview.classList.contains('has-image')) {
            fileInput.click();
        }
    });
    
    // Double click to change image
    preview.addEventListener('dblclick', (e) => {
        if (e.target.id === 'remove-image-btn' || e.target.closest('#remove-image-btn')) {
            return;
        }
        fileInput.click();
    });
    
    // Mouse drag for positioning
    preview.addEventListener('mousedown', (e) => startImageDrag(e, preview));
    document.addEventListener('mousemove', (e) => onImageDrag(e));
    document.addEventListener('mouseup', () => endImageDrag());
    
    // Touch drag for positioning
    preview.addEventListener('touchstart', (e) => startImageDrag(e, preview), { passive: false });
    document.addEventListener('touchmove', (e) => onImageDrag(e), { passive: false });
    document.addEventListener('touchend', () => endImageDrag());
    
    // Update preview name when typing
    nameInput.addEventListener('input', updatePreviewName);
}

function updatePreviewName() {
    const nameInput = document.getElementById('card-name');
    const previewName = document.getElementById('preview-card-name');
    const name = nameInput.value.trim();
    previewName.textContent = name || 'Nome do Card';
}

function startImageDrag(e, preview) {
    // Only start drag if there's an image
    if (!preview.classList.contains('has-image')) return;
    
    // Don't start drag on remove button
    if (e.target.id === 'remove-image-btn' || e.target.closest('#remove-image-btn')) {
        return;
    }
    
    e.preventDefault();
    
    imageDragState.isDragging = true;
    imageDragState.startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    imageDragState.startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    imageDragState.startPositionX = currentImagePositionX;
    imageDragState.startPositionY = currentImagePositionY;
    
    preview.classList.add('dragging');
}

function onImageDrag(e) {
    if (!imageDragState.isDragging) return;
    
    e.preventDefault();
    
    const currentX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const currentY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    
    const diffX = imageDragState.startX - currentX; // Inverted: drag left = show right part
    const diffY = imageDragState.startY - currentY; // Inverted: drag up = show lower part
    
    // Calculate new position (sensitivity based on preview size)
    const preview = document.getElementById('image-preview');
    const sensitivityX = 150 / preview.offsetWidth;
    const sensitivityY = 150 / preview.offsetHeight;
    
    let newPositionX = imageDragState.startPositionX + (diffX * sensitivityX);
    let newPositionY = imageDragState.startPositionY + (diffY * sensitivityY);
    
    // Clamp between 0 and 100
    newPositionX = Math.max(0, Math.min(100, newPositionX));
    newPositionY = Math.max(0, Math.min(100, newPositionY));
    
    currentImagePositionX = newPositionX;
    currentImagePositionY = newPositionY;
    
    // Update preview
    const previewImg = document.getElementById('preview-img');
    previewImg.style.objectPosition = `${currentImagePositionX}% ${currentImagePositionY}%`;
}

function endImageDrag() {
    if (!imageDragState.isDragging) return;
    
    imageDragState.isDragging = false;
    
    const preview = document.getElementById('image-preview');
    preview.classList.remove('dragging');
}

function getCardImageData() {
    return {
        image: currentCardImage,
        imagePositionX: currentImagePositionX,
        imagePositionY: currentImagePositionY
    };
}

function setCardImageData(image, positionX, positionY) {
    currentCardImage = image || null;
    
    // Handle legacy single position (convert to X=50, Y=position)
    if (positionY === undefined && positionX !== undefined) {
        // Legacy: positionX is actually the old single position (Y)
        if (typeof positionX === 'string') {
            if (positionX === 'top') currentImagePositionY = 0;
            else if (positionX === 'bottom') currentImagePositionY = 100;
            else currentImagePositionY = 50;
        } else {
            currentImagePositionY = positionX ?? 50;
        }
        currentImagePositionX = 50;
    } else {
        currentImagePositionX = positionX ?? 50;
        currentImagePositionY = positionY ?? 50;
    }
    
    if (currentCardImage) {
        showImagePreview(currentCardImage);
    } else {
        hideImagePreview();
    }
}

function clearCardImageData() {
    currentCardImage = null;
    currentImagePositionX = 50;
    currentImagePositionY = 50;
    hideImagePreview();
    document.getElementById('card-image').value = '';
}

// =====================================================
// RICH TEXT EDITOR FUNCTIONS
// =====================================================

let currentEditor = null;
let selectedRange = null;
let selectedTagColor = 'yellow';

function initRichEditors() {
    // Initialize all rich editors
    const editors = document.querySelectorAll('.rich-editor');
    editors.forEach(editor => {
        // Handle toolbar buttons for this editor's container
        const container = editor.closest('.rich-editor-container');
        const toolbar = container.querySelector('.rich-editor-toolbar');
        
        if (toolbar) {
            toolbar.querySelectorAll('.toolbar-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    currentEditor = editor;
                    const format = btn.dataset.format;
                    const tag = btn.dataset.tag;
                    
                    if (format) {
                        handleFormatClick(format, btn);
                    } else if (tag) {
                        applyPresetTag(tag);
                    }
                });
            });
        }
        
        // Save selection when editor loses focus
        editor.addEventListener('blur', () => {
            saveSelection();
        });
        
        // Set default paragraph separator to use <p> tags instead of <div>
        document.execCommand('defaultParagraphSeparator', false, 'p');
        
        // Handle Enter key to create proper paragraphs
        editor.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                
                // Insert a paragraph break
                const sel = window.getSelection();
                if (sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    range.deleteContents();
                    
                    // Create two <br> tags for visual paragraph spacing
                    const br1 = document.createElement('br');
                    const br2 = document.createElement('br');
                    
                    range.insertNode(br2);
                    range.insertNode(br1);
                    
                    // Move cursor after the breaks
                    range.setStartAfter(br2);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            } else if (e.key === 'Enter' && e.shiftKey) {
                // Shift+Enter inserts a single line break
                e.preventDefault();
                document.execCommand('insertLineBreak');
            }
        });
        
        // Keyboard shortcuts (Ctrl+B, Ctrl+I)
        editor.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'b') {
                    e.preventDefault();
                    currentEditor = editor;
                    document.execCommand('bold', false, null);
                } else if (e.key === 'i') {
                    e.preventDefault();
                    currentEditor = editor;
                    document.execCommand('italic', false, null);
                }
            }
        });
        
        // Handle paste - preserve line breaks
        editor.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            
            // Convert newlines to <br><br> for paragraph separation
            const html = text
                .split(/\n\n+/)  // Split by double newlines (paragraphs)
                .map(para => para.replace(/\n/g, '<br>'))  // Single newlines become <br>
                .join('<br><br>');  // Paragraphs separated by double <br>
            
            document.execCommand('insertHTML', false, html);
        });
        
        // Prevent typing from inheriting highlight/tag formatting at the edge
        editor.addEventListener('keydown', (e) => {
            // Only for regular character keys (not modifiers, arrows, etc.)
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const sel = window.getSelection();
                if (sel.rangeCount > 0 && sel.isCollapsed) {
                    const range = sel.getRangeAt(0);
                    const node = range.startContainer;
                    
                    // Check if we're at the end of a highlight or text-tag span
                    let formattedParent = null;
                    let checkNode = node;
                    
                    while (checkNode && checkNode !== editor) {
                        if (checkNode.nodeType === Node.ELEMENT_NODE && 
                            (checkNode.classList.contains('highlight') || checkNode.classList.contains('text-tag'))) {
                            formattedParent = checkNode;
                            break;
                        }
                        checkNode = checkNode.parentNode;
                    }
                    
                    if (formattedParent) {
                        // Check if cursor is at the very end of the formatted span
                        const isAtEnd = (node === formattedParent && range.startOffset === formattedParent.childNodes.length) ||
                                        (node.nodeType === Node.TEXT_NODE && 
                                         node.parentNode === formattedParent && 
                                         range.startOffset === node.length &&
                                         !node.nextSibling);
                        
                        if (isAtEnd) {
                            e.preventDefault();
                            
                            // Insert the character outside the span
                            const textNode = document.createTextNode(e.key);
                            if (formattedParent.nextSibling) {
                                formattedParent.parentNode.insertBefore(textNode, formattedParent.nextSibling);
                            } else {
                                formattedParent.parentNode.appendChild(textNode);
                            }
                            
                            // Move cursor after the new character
                            const newRange = document.createRange();
                            newRange.setStart(textNode, 1);
                            newRange.collapse(true);
                            sel.removeAllRanges();
                            sel.addRange(newRange);
                        }
                    }
                }
            }
        });

    });
    
    // Initialize highlight picker
    initHighlightPicker();
    
    // Close modals on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeLinkModal();
            closeTagModal();
            closeHighlightPicker();
            closeDiceModal();
        }
    });
    
    // Close highlight picker when clicking outside
    document.addEventListener('click', (e) => {
        const picker = document.getElementById('highlight-picker');
        if (picker.classList.contains('active') && !e.target.closest('.highlight-picker') && !e.target.closest('[data-format="highlight"]')) {
            closeHighlightPicker();
        }
    });
}

function saveSelection() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
        selectedRange = sel.getRangeAt(0).cloneRange();
    }
}

function restoreSelection() {
    if (selectedRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(selectedRange);
    }
}

function handleFormatClick(format, btn) {
    switch (format) {
        case 'bold':
            document.execCommand('bold', false, null);
            break;
        case 'italic':
            document.execCommand('italic', false, null);
            break;
        case 'highlight':
            showHighlightPicker(btn);
            break;
        case 'tag':
            openTagModal();
            break;
        case 'link-card':
            openLinkModal();
            break;
        case 'dice-roll':
            openDiceModal();
            break;
    }
}

// =====================================================
// HIGHLIGHT FUNCTIONS
// =====================================================

function initHighlightPicker() {
    const picker = document.getElementById('highlight-picker');
    picker.querySelectorAll('.highlight-color').forEach(btn => {
        btn.addEventListener('click', () => {
            const color = btn.dataset.color;
            applyHighlight(color);
            closeHighlightPicker();
        });
    });
}

function showHighlightPicker(btn) {
    saveSelection();
    
    const sel = window.getSelection();
    if (sel.rangeCount === 0 || sel.isCollapsed) {
        ui.showToast('Selecione um texto para destacar', 'info');
        return;
    }
    
    const picker = document.getElementById('highlight-picker');
    const rect = btn.getBoundingClientRect();
    picker.style.top = `${rect.bottom + 8}px`;
    picker.style.left = `${rect.left}px`;
    picker.classList.add('active');
}

function closeHighlightPicker() {
    document.getElementById('highlight-picker').classList.remove('active');
}

function applyHighlight(color) {
    restoreSelection();
    
    const sel = window.getSelection();
    if (sel.rangeCount === 0 || sel.isCollapsed) {
        ui.showToast('Selecione um texto para destacar', 'info');
        return;
    }
    
    const range = sel.getRangeAt(0);
    
    // Check if selection is inside a highlight span
    let highlightParent = null;
    let node = range.commonAncestorContainer;
    
    // Walk up to find highlight parent
    while (node && node !== document.body) {
        if (node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('highlight')) {
            highlightParent = node;
            break;
        }
        node = node.parentNode;
    }
    
    // If inside highlight, remove it (toggle off)
    if (highlightParent) {
        const parent = highlightParent.parentNode;
        while (highlightParent.firstChild) {
            parent.insertBefore(highlightParent.firstChild, highlightParent);
        }
        parent.removeChild(highlightParent);
        sel.removeAllRanges();
        ui.showToast('Destaque removido', 'info');
        return;
    }
    
    // Apply new highlight
    const span = document.createElement('span');
    span.className = `highlight ${color === 'yellow' ? '' : color}`;
    
    try {
        range.surroundContents(span);
    } catch (e) {
        // If selection spans multiple elements, extract and wrap
        const fragment = range.extractContents();
        span.appendChild(fragment);
        range.insertNode(span);
    }
    
    // Move cursor outside the span so new text won't be highlighted
    moveCursorAfterElement(span);
}

// Helper function to move cursor after an element
function moveCursorAfterElement(element) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    
    // Insert a zero-width space after the element to break formatting inheritance
    const zeroWidthSpace = document.createTextNode('\u200B');
    if (element.nextSibling) {
        element.parentNode.insertBefore(zeroWidthSpace, element.nextSibling);
    } else {
        element.parentNode.appendChild(zeroWidthSpace);
    }
    
    // Set cursor after the zero-width space
    const newRange = document.createRange();
    newRange.setStartAfter(zeroWidthSpace);
    newRange.collapse(true);
    sel.addRange(newRange);
    
    // Focus the editor to ensure cursor is active
    const editor = element.closest('.rich-editor');
    if (editor) {
        editor.focus();
    }
}

// =====================================================
// TAG FUNCTIONS
// =====================================================

function openTagModal() {
    saveSelection();
    
    const sel = window.getSelection();
    if (sel.rangeCount === 0 || sel.isCollapsed) {
        ui.showToast('Selecione um texto para aplicar a tag', 'info');
        return;
    }
    
    // Get selected text for preview
    const selectedText = sel.toString().trim();
    
    // Populate card selector
    const select = document.getElementById('tag-link-card');
    const allCards = dataStore.getAllCards();
    select.innerHTML = '<option value="">Sem link</option>' +
        allCards.map(card => `<option value="${card.id}">${ui.getTypeIcon(card.type)} ${ui.escapeHtml(card.name)}</option>`).join('');
    
    // Reset form
    document.getElementById('tag-name-input').value = '';
    document.getElementById('tag-description-input').value = '';
    document.querySelectorAll('.tag-color-option').forEach(opt => opt.classList.remove('selected'));
    document.querySelector('.tag-color-option[data-color="yellow"]').classList.add('selected');
    selectedTagColor = 'yellow';
    
    // Update preview with initial state
    updateTagPreview(selectedText, '', 'yellow');
    
    // Setup input listeners for live preview
    const nameInput = document.getElementById('tag-name-input');
    const descInput = document.getElementById('tag-description-input');
    
    nameInput.oninput = () => updateTagPreview(selectedText, nameInput.value, selectedTagColor);
    descInput.oninput = () => updateTagPreview(selectedText, nameInput.value, selectedTagColor);
    
    // Setup color picker
    document.querySelectorAll('.tag-color-option').forEach(opt => {
        opt.onclick = () => {
            document.querySelectorAll('.tag-color-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedTagColor = opt.dataset.color;
            updateTagPreview(selectedText, nameInput.value, selectedTagColor);
        };
    });
    
    document.getElementById('tag-modal-overlay').classList.add('active');
    document.getElementById('tag-name-input').focus();
}

function updateTagPreview(text, tagName, color) {
    const preview = document.getElementById('tag-preview');
    if (!preview) return;
    
    const displayText = text.length > 25 ? text.substring(0, 25) + '...' : text;
    const bgColor = getTagColorBg(color);
    const textColor = getTagColorText(color);
    
    preview.style.setProperty('--tag-bg', bgColor);
    preview.style.setProperty('--tag-color', textColor);
    preview.style.background = bgColor;
    preview.style.color = textColor;
    preview.innerHTML = `<span class="tag-preview-text">${ui.escapeHtml(displayText)}</span>`;
    
    // Add tag name indicator if provided
    if (tagName) {
        preview.title = `Tag: ${tagName}`;
    } else {
        preview.title = '';
    }
}

function closeTagModal() {
    document.getElementById('tag-modal-overlay').classList.remove('active');
}

function applyCustomTag() {
    restoreSelection();
    
    const tagName = document.getElementById('tag-name-input').value.trim();
    const tagDescription = document.getElementById('tag-description-input').value.trim();
    const linkedCardId = document.getElementById('tag-link-card').value;
    
    if (!tagName) {
        ui.showToast('Digite um nome para a tag', 'error');
        return;
    }
    
    const sel = window.getSelection();
    if (sel.rangeCount === 0 || sel.isCollapsed) {
        ui.showToast('Selecione um texto primeiro', 'error');
        return;
    }
    
    const range = sel.getRangeAt(0);
    
    // Check if selection is inside a text-tag span (toggle off)
    let tagParent = null;
    let node = range.commonAncestorContainer;
    
    while (node && node !== document.body) {
        if (node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('text-tag')) {
            tagParent = node;
            break;
        }
        node = node.parentNode;
    }
    
    // If inside tag, remove it
    if (tagParent) {
        const parent = tagParent.parentNode;
        while (tagParent.firstChild) {
            parent.insertBefore(tagParent.firstChild, tagParent);
        }
        parent.removeChild(tagParent);
        sel.removeAllRanges();
        closeTagModal();
        ui.showToast('Tag removida', 'info');
        return;
    }
    
    // Apply new tag
    const span = document.createElement('span');
    span.className = `text-tag`;
    span.dataset.tag = tagName;
    span.dataset.color = selectedTagColor;
    
    if (tagDescription) {
        span.dataset.description = tagDescription;
    }
    
    span.style.setProperty('--tag-bg', getTagColorBg(selectedTagColor));
    span.style.setProperty('--tag-color', getTagColorText(selectedTagColor));
    span.style.background = `var(--tag-bg)`;
    span.style.color = `var(--tag-color)`;
    
    if (linkedCardId) {
        span.dataset.cardId = linkedCardId;
        span.onclick = () => openCardFromTag(linkedCardId);
    }
    
    try {
        range.surroundContents(span);
    } catch (e) {
        const fragment = range.extractContents();
        span.appendChild(fragment);
        range.insertNode(span);
    }
    
    // Move cursor outside the span so new text won't have the tag
    moveCursorAfterElement(span);
    closeTagModal();
    
    const feedback = tagDescription ? `Tag "${tagName}" aplicada com descrição` : `Tag "${tagName}" aplicada`;
    ui.showToast(feedback, 'success');
}

function applyPresetTag(tagType) {
    const sel = window.getSelection();
    if (sel.rangeCount === 0 || sel.isCollapsed) {
        ui.showToast('Selecione um texto para aplicar a tag', 'info');
        return;
    }
    
    const range = sel.getRangeAt(0);
    
    // Check if selection is inside a text-tag span (toggle off)
    let tagParent = null;
    let node = range.commonAncestorContainer;
    
    while (node && node !== document.body) {
        if (node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('text-tag')) {
            tagParent = node;
            break;
        }
        node = node.parentNode;
    }
    
    // If inside tag, remove it
    if (tagParent) {
        const parent = tagParent.parentNode;
        while (tagParent.firstChild) {
            parent.insertBefore(tagParent.firstChild, tagParent);
        }
        parent.removeChild(tagParent);
        sel.removeAllRanges();
        ui.showToast('Tag removida', 'info');
        return;
    }
    
    // Apply new tag
    const span = document.createElement('span');
    span.className = `text-tag ${tagType}`;
    span.dataset.tag = tagType;
    
    try {
        range.surroundContents(span);
    } catch (e) {
        const fragment = range.extractContents();
        span.appendChild(fragment);
        range.insertNode(span);
    }
    
    // Move cursor outside the span so new text won't have the tag
    moveCursorAfterElement(span);
}

function getTagColorBg(color) {
    const colors = {
        yellow: 'rgba(240, 208, 96, 0.15)',
        orange: 'rgba(245, 158, 107, 0.15)',
        red: 'rgba(229, 115, 115, 0.15)',
        pink: 'rgba(244, 143, 177, 0.15)',
        purple: 'rgba(176, 136, 245, 0.15)',
        blue: 'rgba(107, 179, 245, 0.15)',
        cyan: 'rgba(77, 208, 225, 0.15)',
        green: 'rgba(129, 199, 132, 0.15)'
    };
    return colors[color] || colors.yellow;
}

function getTagColorText(color) {
    const colors = {
        yellow: '#f0d060',
        orange: '#f59e6b',
        red: '#e57373',
        pink: '#f48fb1',
        purple: '#b088f5',
        blue: '#6bb3f5',
        cyan: '#4dd0e1',
        green: '#81c784'
    };
    return colors[color] || colors.yellow;
}

function openCardFromTag(cardId) {
    ui.openCard(cardId);
}

// =====================================================
// DICE ROLL FUNCTIONS
// =====================================================

function openDiceModal() {
    saveSelection();
    
    // Reset form
    document.getElementById('dice-name-input').value = '';
    document.getElementById('dice-description-input').value = '';
    document.getElementById('dice-formula-input').value = '';
    
    // Update preview
    updateDicePreview();
    
    // Setup input listeners for live preview
    const nameInput = document.getElementById('dice-name-input');
    const formulaInput = document.getElementById('dice-formula-input');
    
    nameInput.oninput = updateDicePreview;
    formulaInput.oninput = updateDicePreview;
    
    document.getElementById('dice-modal-overlay').classList.add('active');
    document.getElementById('dice-name-input').focus();
}

function closeDiceModal() {
    document.getElementById('dice-modal-overlay').classList.remove('active');
}

function updateDicePreview() {
    const name = document.getElementById('dice-name-input').value.trim() || 'Nome da Ação';
    const preview = document.getElementById('dice-preview');
    
    if (preview) {
        preview.querySelector('.dice-name').textContent = name;
    }
}

function insertDiceRoll() {
    const name = document.getElementById('dice-name-input').value.trim();
    const description = document.getElementById('dice-description-input').value.trim();
    const formula = document.getElementById('dice-formula-input').value.trim();
    
    if (!name) {
        ui.showToast('Digite um nome para a ação', 'error');
        return;
    }
    
    if (!formula) {
        ui.showToast('Digite a fórmula do dado', 'error');
        return;
    }
    
    // Validate formula format
    if (!isValidDiceFormula(formula)) {
        ui.showToast('Fórmula inválida. Use formatos como: 1d20, 2d6+3, 1d20+5', 'error');
        return;
    }
    
    // Create the dice roll tag element
    const span = document.createElement('span');
    span.className = 'dice-roll-tag';
    span.dataset.formula = formula;
    span.dataset.name = name;
    if (description) {
        span.dataset.description = description;
    }
    span.innerHTML = `<span class="dice-icon">🎲</span><span class="dice-name">${ui.escapeHtml(name)}</span>`;
    span.onclick = () => executeDiceRoll(name, formula);
    span.setAttribute('contenteditable', 'false');
    
    // Restore selection and insert
    restoreSelection();
    
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(span);
        
        // Move cursor after the element
        moveCursorAfterElement(span);
    }
    
    closeDiceModal();
    ui.showToast(`Rolagem "${name}" inserida`, 'success');
}

function isValidDiceFormula(formula) {
    // Match patterns like: 1d20, 2d6, 3d8+2, 1d20+5, 1d20-2, 2d6+1d4, etc.
    const dicePattern = /^(\d+d\d+)([+-]\d+)?([+-]\d+d\d+)*([+-]\d+)?$/i;
    return dicePattern.test(formula.replace(/\s/g, ''));
}

function executeDiceRoll(name, formula) {
    const result = rollDice(formula);
    showDiceResult(name, formula, result);
}

function rollDice(formula) {
    // Parse and execute dice formula
    const cleanFormula = formula.replace(/\s/g, '');
    let total = 0;
    
    // Split by + and - while keeping the operators
    const parts = cleanFormula.split(/([+-])/);
    let currentOp = '+';
    
    for (const part of parts) {
        if (part === '+' || part === '-') {
            currentOp = part;
            continue;
        }
        
        if (!part) continue;
        
        let value = 0;
        
        // Check if it's a dice roll (e.g., 2d6)
        const diceMatch = part.match(/^(\d+)d(\d+)$/i);
        if (diceMatch) {
            const numDice = parseInt(diceMatch[1]);
            const dieSize = parseInt(diceMatch[2]);
            for (let i = 0; i < numDice; i++) {
                value += Math.floor(Math.random() * dieSize) + 1;
            }
        } else {
            // It's a modifier number
            value = parseInt(part) || 0;
        }
        
        if (currentOp === '+') {
            total += value;
        } else {
            total -= value;
        }
    }
    
    return total;
}

function showDiceResult(name, formula, result) {
    // Create or get the result toast
    let toast = document.getElementById('dice-result-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'dice-result-toast';
        toast.className = 'dice-result-toast';
        document.body.appendChild(toast);
    }
    
    toast.innerHTML = `
        <div class="roll-name">${ui.escapeHtml(name)}</div>
        <div class="roll-formula">${ui.escapeHtml(formula)}</div>
        <div class="roll-result">${result}</div>
    `;
    
    // Show the toast
    toast.classList.add('active');
    
    // Hide after 2 seconds
    setTimeout(() => {
        toast.classList.remove('active');
    }, 2000);
}

// =====================================================
// CARD LINK FUNCTIONS
// =====================================================

function openLinkModal() {
    saveSelection();
    
    const sel = window.getSelection();
    if (sel.rangeCount === 0 || sel.isCollapsed) {
        ui.showToast('Selecione um texto para criar o link', 'info');
        return;
    }
    
    document.getElementById('link-search-input').value = '';
    renderLinkCardsList();
    document.getElementById('link-modal-overlay').classList.add('active');
    document.getElementById('link-search-input').focus();
}

function closeLinkModal() {
    document.getElementById('link-modal-overlay').classList.remove('active');
}

function renderLinkCardsList(filter = '') {
    const container = document.getElementById('link-cards-list');
    let cards = dataStore.getAllCards();
    
    if (filter) {
        const lowerFilter = filter.toLowerCase();
        cards = cards.filter(c => c.name.toLowerCase().includes(lowerFilter));
    }
    
    if (cards.length === 0) {
        container.innerHTML = '<div class="link-card-empty">Nenhum card encontrado</div>';
        return;
    }
    
    container.innerHTML = cards.map(card => `
        <div class="link-card-item" onclick="insertCardLink('${card.id}')">
            <span class="card-icon">${ui.getTypeIcon(card.type)}</span>
            <span class="card-name">${ui.escapeHtml(card.name)}</span>
            <span class="card-type-label">${ui.getTypeName(card.type)}</span>
        </div>
    `).join('');
}

function filterLinkCards(query) {
    renderLinkCardsList(query);
}

function insertCardLink(cardId) {
    restoreSelection();
    
    const card = dataStore.getCard(cardId);
    if (!card) return;
    
    const sel = window.getSelection();
    if (sel.rangeCount === 0) return;
    
    const range = sel.getRangeAt(0);
    const link = document.createElement('span');
    link.className = `card-link ${card.type}`;
    link.dataset.cardId = cardId;
    link.contentEditable = 'false';
    
    // Get selected text or use card name
    const selectedText = range.toString().trim() || card.name;
    link.textContent = selectedText;
    
    range.deleteContents();
    range.insertNode(link);
    
    sel.removeAllRanges();
    closeLinkModal();
}

// =====================================================
// RICH EDITOR DATA SYNC
// =====================================================

function syncEditorToTextarea(editorId, textareaId) {
    const editor = document.getElementById(editorId);
    const textarea = document.getElementById(textareaId);
    if (editor && textarea) {
        textarea.value = editor.innerHTML;
    }
}

function syncTextareaToEditor(textareaId, editorId) {
    const editor = document.getElementById(editorId);
    const textarea = document.getElementById(textareaId);
    if (editor && textarea) {
        editor.innerHTML = textarea.value || '';
    }
}

function getEditorContent(editorId) {
    const editor = document.getElementById(editorId);
    return editor ? editor.innerHTML : '';
}

function setEditorContent(editorId, content) {
    const editor = document.getElementById(editorId);
    if (editor) {
        editor.innerHTML = content || '';
    }
}

// =====================================================
// INITIALIZE ON DOM READY
// =====================================================

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    initRichEditors();
    initEventConnections();
    initResumoCharCounter();
});

// =====================================================
// CHARACTER COUNTER FOR RESUMO
// =====================================================

function initResumoCharCounter() {
    const resumoInput = document.getElementById('card-resumo');
    const charCount = document.getElementById('resumo-char-count');
    
    if (resumoInput && charCount) {
        const updateCounter = () => {
            const length = resumoInput.value.length;
            charCount.textContent = length;
            
            // Change color based on length
            if (length > 150) {
                charCount.style.color = 'var(--color-evento)'; // Red-ish warning
            } else if (length > 120) {
                charCount.style.color = 'var(--color-accent)'; // Yellow-ish warning
            } else {
                charCount.style.color = ''; // Default
            }
        };
        
        resumoInput.addEventListener('input', updateCounter);
        // Initialize on page load
        updateCounter();
    }
}

// =====================================================
// EVENT CONNECTIONS (Locais e Personagens relacionados)
// =====================================================

function initEventConnections() {
    // Bind event connections selectors
    const eventoLocaisSelect = document.getElementById('evento-locais-select');
    if (eventoLocaisSelect) {
        eventoLocaisSelect.addEventListener('change', (e) => {
            const cardId = e.target.value;
            if (cardId) {
                ui.addConnectionTag(cardId, 'selected-evento-locais');
                e.target.value = '';
            }
        });
    }
    
    const eventoPersonagensSelect = document.getElementById('evento-personagens-select');
    if (eventoPersonagensSelect) {
        eventoPersonagensSelect.addEventListener('change', (e) => {
            const cardId = e.target.value;
            if (cardId) {
                ui.addConnectionTag(cardId, 'selected-evento-personagens');
                e.target.value = '';
            }
        });
    }
}

function populateEventConnectionSelectors() {
    // Locais para eventos
    const locaisSelect = document.getElementById('evento-locais-select');
    if (locaisSelect) {
        const locations = dataStore.getCardsByType('local');
        locaisSelect.innerHTML = `
            <option value="">+ Adicionar local...</option>
            ${locations.map(loc => `
                <option value="${loc.id}">${ui.escapeHtml(loc.name)}</option>
            `).join('')}
        `;
    }
    
    // Personagens para eventos
    const personagensSelect = document.getElementById('evento-personagens-select');
    if (personagensSelect) {
        const characters = dataStore.getCardsByType('personagem');
        personagensSelect.innerHTML = `
            <option value="">+ Adicionar personagem...</option>
            ${characters.map(char => `
                <option value="${char.id}">${ui.escapeHtml(char.name)}</option>
            `).join('')}
        `;
    }
}

// =====================================================
// ACCORDION FUNCTIONS
// =====================================================

function toggleAccordion(header) {
    const item = header.closest('.accordion-item');
    const content = item.querySelector('.accordion-content');
    const isOpen = item.classList.contains('open');
    
    // Toggle current
    if (isOpen) {
        item.classList.remove('open');
    } else {
        item.classList.add('open');
    }
}

function toggleViewAccordion(header) {
    const item = header.closest('.view-accordion-item');
    const isOpen = item.classList.contains('open');
    
    // Toggle current
    if (isOpen) {
        item.classList.remove('open');
    } else {
        item.classList.add('open');
    }
}

// Toggle section block (new narrative card view)
function toggleSectionBlock(headerElement) {
    const section = headerElement.closest('.card-section-block');
    if (section) {
        section.classList.toggle('expanded');
    }
}

// Open accordion by data-section attribute
function openAccordionBySection(sectionName) {
    const item = document.querySelector(`.accordion-item[data-section="${sectionName}"]`);
    if (item) {
        item.classList.add('open');
    }
}

// Close all accordions
function closeAllAccordions() {
    document.querySelectorAll('.accordion-item.open').forEach(item => {
        item.classList.remove('open');
    });
}

// =====================================================
// TAGS INPUT FUNCTIONS
// =====================================================

let cardTags = [];

function handleTagInput(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const input = event.target;
        const tagText = input.value.trim();
        
        if (tagText && !cardTags.includes(tagText)) {
            cardTags.push(tagText);
            renderTagsList();
        }
        
        input.value = '';
    }
}

function renderTagsList() {
    const container = document.getElementById('card-tags-list');
    if (!container) return;
    
    container.innerHTML = cardTags.map((tag, index) => `
        <span class="tag-item">
            ${ui.escapeHtml(tag)}
            <button type="button" class="remove-tag" onclick="removeTag(${index})">×</button>
        </span>
    `).join('');
}

function removeTag(index) {
    cardTags.splice(index, 1);
    renderTagsList();
}

function clearCardTags() {
    cardTags = [];
    renderTagsList();
}

function setCardTags(tags) {
    cardTags = tags || [];
    renderTagsList();
}
// =====================================================
// MINDMAP EDITOR - Visual Mind Mapping (Miro-style)
// =====================================================

let cascadeNodes = []; // Keep for compatibility
let cardConnections = [];
let mindMapNodes = [];
let mindMapConnections = [];
let mindMapDragState = {
    isDragging: false,
    nodeId: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0
};
let mindMapPanState = {
    isPanning: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0
};
let mindMapConnectionState = {
    isConnecting: false,
    fromNodeId: null,
    fromAnchor: null,
    tempLine: null
};
let mindMapScale = 1;
let mindMapPanOffset = { x: 0, y: 0 };
let pendingConnection = null;

// Node type definitions by card type
const nodeTypesByCardType = {
    evento: [
        { type: 'trigger', icon: '⚡', label: 'Gatilho' },
        { type: 'condition', icon: '❓', label: 'Condição' },
        { type: 'consequence', icon: '→', label: 'Consequência' },
        { type: 'action', icon: '⚔', label: 'Ação' },
        { type: 'state', icon: '●', label: 'Estado' }
    ],
    local: [
        { type: 'state', icon: '📍', label: 'Área' },
        { type: 'action', icon: '👁', label: 'Subárea' },
        { type: 'secret', icon: '🔮', label: 'Pista' },
        { type: 'trigger', icon: '⚡', label: 'Elemento' }
    ],
    personagem: [
        { type: 'trait', icon: '💭', label: 'Traço' },
        { type: 'action', icon: '⚔', label: 'Habilidade' },
        { type: 'state', icon: '●', label: 'Comportamento' },
        { type: 'link', icon: '🔗', label: 'Vínculo' }
    ]
};

// Add MindMap Node
function addMindMapNode() {
    showNodeTypeModal();
}

function createNode(type, icon) {
    const canvas = document.getElementById('mindmap-canvas');
    const rect = canvas.getBoundingClientRect();
    
    const newNode = {
        id: Date.now(),
        type: type,
        icon: icon,
        label: '',
        x: Math.random() * (rect.width - 200) + 50,
        y: Math.random() * (rect.height - 100) + 50
    };
    
    mindMapNodes.push(newNode);
    
    // Convert to old format for compatibility
    cascadeNodes.push({
        id: newNode.id,
        type: newNode.type,
        icon: newNode.icon,
        label: newNode.label,
        children: []
    });
    
    closeNodeTypeModal();
    renderMindMap();
    
    // Focus the new node
    setTimeout(() => {
        const node = document.querySelector(`[data-node-id="${newNode.id}"] textarea`);
        if (node) node.focus();
    }, 100);
}

function renderMindMap() {
    const container = document.getElementById('mindmap-nodes');
    const emptyMsg = document.getElementById('mindmap-empty');
    const svgConnections = document.getElementById('mindmap-connections');
    
    if (!container) return;
    
    if (mindMapNodes.length === 0) {
        container.innerHTML = '';
        if (emptyMsg) emptyMsg.style.display = 'flex';
        if (svgConnections) svgConnections.innerHTML = '';
        return;
    }
    
    if (emptyMsg) emptyMsg.style.display = 'none';
    
    // Render nodes
    container.innerHTML = mindMapNodes.map(node => `
        <div class="mindmap-node" 
             data-node-id="${node.id}"
             style="left: ${node.x}px; top: ${node.y}px;"
             onmousedown="startMindMapDrag(event, ${node.id})"
             oncontextmenu="showNodeContextMenu(event, ${node.id})">
            <div class="mindmap-node-icon ${node.type}">${node.icon}</div>
            <textarea class="mindmap-node-input"
                      placeholder="Escreva aqui..."
                      maxlength="200"
                      rows="1"
                      oninput="autoResizeTextarea(this); updateMindMapNodeLabel(${node.id}, this.value)"
                      onclick="event.stopPropagation()"
                      onkeydown="handleMindMapNodeKeydown(event, ${node.id})">${node.label || ''}</textarea>
        </div>
    `).join('');
    
    // Auto-resize all textareas
    setTimeout(() => {
        document.querySelectorAll('.mindmap-node-input').forEach(ta => autoResizeTextarea(ta));
    }, 0);
    
    // Render connections
    renderMindMapConnections();
    
    // Render connections (empty for now)
    if (svgConnections) {
        svgConnections.innerHTML = '';
    }
}

function startMindMapDrag(event, nodeId) {
    // Don't start drag if in connection mode
    if (mindMapConnectionState.isConnecting) {
        return;
    }
    
    if (event.target.tagName === 'TEXTAREA' || event.target.tagName === 'BUTTON') {
        return;
    }
    
    event.preventDefault();
    
    const node = mindMapNodes.find(n => n.id === nodeId);
    if (!node) return;
    
    mindMapDragState.isDragging = true;
    mindMapDragState.nodeId = nodeId;
    mindMapDragState.startX = event.clientX;
    mindMapDragState.startY = event.clientY;
    mindMapDragState.offsetX = node.x;
    mindMapDragState.offsetY = node.y;
    
    const nodeEl = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (nodeEl) nodeEl.classList.add('dragging');
    
    document.addEventListener('mousemove', onMindMapDrag);
    document.addEventListener('mouseup', endMindMapDrag);
}

function onMindMapDrag(event) {
    if (!mindMapDragState.isDragging) return;
    
    // Use requestAnimationFrame for smooth updates
    if (mindMapDragState.animationFrame) {
        cancelAnimationFrame(mindMapDragState.animationFrame);
    }
    
    mindMapDragState.animationFrame = requestAnimationFrame(() => {
        const deltaX = (event.clientX - mindMapDragState.startX) / mindMapScale;
        const deltaY = (event.clientY - mindMapDragState.startY) / mindMapScale;
        
        const node = mindMapNodes.find(n => n.id === mindMapDragState.nodeId);
        if (!node) return;
        
        node.x = mindMapDragState.offsetX + deltaX;
        node.y = mindMapDragState.offsetY + deltaY;
        
        const nodeEl = document.querySelector(`[data-node-id="${node.id}"]`);
        if (nodeEl) {
            nodeEl.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        }
        
        // Update connections less frequently
        if (!mindMapDragState.lastConnectionUpdate || Date.now() - mindMapDragState.lastConnectionUpdate > 16) {
            renderMindMapConnections();
            mindMapDragState.lastConnectionUpdate = Date.now();
        }
    });
}

function endMindMapDrag() {
    if (mindMapDragState.nodeId) {
        const node = mindMapNodes.find(n => n.id === mindMapDragState.nodeId);
        const nodeEl = document.querySelector(`[data-node-id="${mindMapDragState.nodeId}"]`);
        
        if (nodeEl && node) {
            // Apply final position
            nodeEl.style.left = node.x + 'px';
            nodeEl.style.top = node.y + 'px';
            nodeEl.style.transform = '';
            nodeEl.classList.remove('dragging');
        }
        
        // Final connection update
        renderMindMapConnections();
    }
    
    if (mindMapDragState.animationFrame) {
        cancelAnimationFrame(mindMapDragState.animationFrame);
    }
    
    mindMapDragState.isDragging = false;
    mindMapDragState.nodeId = null;
    mindMapDragState.animationFrame = null;
    mindMapDragState.lastConnectionUpdate = null;
    
    document.removeEventListener('mousemove', onMindMapDrag);
    document.removeEventListener('mouseup', endMindMapDrag);
}

function updateMindMapNodeLabel(nodeId, value) {
    const node = mindMapNodes.find(n => n.id === nodeId);
    if (node) {
        node.label = value;
        
        // Update cascadeNodes for compatibility
        const cascadeNode = cascadeNodes.find(n => n.id === nodeId);
        if (cascadeNode) {
            cascadeNode.label = value;
        }
    }
}

function deleteMindMapNode(event, nodeId) {
    if (event) event.stopPropagation();
    
    // Remove connections to/from this node
    mindMapConnections = mindMapConnections.filter(conn => 
        conn.fromNode !== nodeId && conn.toNode !== nodeId
    );
    
    mindMapNodes = mindMapNodes.filter(n => n.id !== nodeId);
    cascadeNodes = cascadeNodes.filter(n => n.id !== nodeId);
    
    renderMindMap();
}

// Context menu system
let contextMenuState = {
    isOpen: false,
    nodeId: null
};

function showNodeContextMenu(event, nodeId) {
    event.preventDefault();
    event.stopPropagation();
    
    // Don't show context menu if clicking on textarea
    if (event.target.tagName === 'TEXTAREA') {
        return;
    }
    
    // Remove existing menu
    closeContextMenu();
    
    // Create context menu
    const menu = document.createElement('div');
    menu.className = 'mindmap-context-menu';
    menu.id = 'mindmap-context-menu';
    menu.innerHTML = `
        <div class="context-menu-item" onclick="startConnectionFromContextMenu(${nodeId})">
            <span class="context-menu-icon">⟶</span>
            <span>Criar conexão</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item delete" onclick="deleteMindMapNode(null, ${nodeId}); closeContextMenu();">
            <span class="context-menu-icon">×</span>
            <span>Apagar nó</span>
        </div>
    `;
    
    // Position menu
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    
    document.body.appendChild(menu);
    
    contextMenuState.isOpen = true;
    contextMenuState.nodeId = nodeId;
    
    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', closeContextMenu);
        document.addEventListener('contextmenu', closeContextMenu);
    }, 0);
}

function closeContextMenu() {
    const menu = document.getElementById('mindmap-context-menu');
    if (menu) {
        menu.remove();
    }
    
    contextMenuState.isOpen = false;
    contextMenuState.nodeId = null;
    
    document.removeEventListener('click', closeContextMenu);
    document.removeEventListener('contextmenu', closeContextMenu);
}

function startConnectionFromContextMenu(nodeId) {
    closeContextMenu();
    
    mindMapConnectionState.isConnecting = true;
    mindMapConnectionState.fromNodeId = nodeId;
    
    // Change cursor
    document.body.style.cursor = 'crosshair';
    
    // Visual feedback on source node
    const sourceNode = document.querySelector(`[data-node-id="${nodeId}"]`);
    if (sourceNode) {
        sourceNode.classList.add('connecting');
    }
    
    document.addEventListener('mousemove', drawTempConnectionFromNode);
    document.addEventListener('mousedown', endConnectionFromNode);
    document.addEventListener('contextmenu', cancelConnection);
}

function cancelConnection(event) {
    if (!mindMapConnectionState.isConnecting) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    document.body.style.cursor = '';
    
    // Remove temp line
    const svg = document.getElementById('mindmap-connections');
    const temp = svg.querySelector('.mindmap-connection-temp');
    if (temp) temp.remove();
    
    // Remove visual feedback
    const sourceNode = document.querySelector(`[data-node-id="${mindMapConnectionState.fromNodeId}"]`);
    if (sourceNode) {
        sourceNode.classList.remove('connecting');
    }
    
    mindMapConnectionState.isConnecting = false;
    mindMapConnectionState.fromNodeId = null;
    
    document.removeEventListener('mousemove', drawTempConnectionFromNode);
    document.removeEventListener('mousedown', endConnectionFromNode);
    document.removeEventListener('contextmenu', cancelConnection);
}

function drawTempConnectionFromNode(event) {
    if (!mindMapConnectionState.isConnecting) return;
    
    const svg = document.getElementById('mindmap-connections');
    const fromNode = mindMapNodes.find(n => n.id === mindMapConnectionState.fromNodeId);
    if (!fromNode) return;
    
    const canvas = document.getElementById('mindmap-canvas');
    const container = document.getElementById('mindmap-nodes');
    const containerRect = container.getBoundingClientRect();
    
    // Mouse position in node coordinate space
    const mouseX = (event.clientX - containerRect.left) / mindMapScale;
    const mouseY = (event.clientY - containerRect.top) / mindMapScale;
    
    // Calculate closest point on node edge
    const fromPos = getClosestEdgePoint(fromNode, mouseX, mouseY);
    
    // Remove old temp line
    const oldTemp = svg.querySelector('.mindmap-connection-temp');
    if (oldTemp) oldTemp.remove();
    
    // Draw new temp line
    const path = createCurvePath(fromPos.x, fromPos.y, mouseX, mouseY);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', path);
    line.setAttribute('class', 'mindmap-connection-temp');
    svg.appendChild(line);
}

function endConnectionFromNode(event) {
    if (!mindMapConnectionState.isConnecting) return;
    
    // Only handle left click
    if (event.button !== 0) return;
    
    event.stopPropagation();
    event.preventDefault();
    
    // Check if we're over a node
    const target = event.target;
    let toNodeEl = target.closest('.mindmap-node');
    
    if (toNodeEl) {
        const toNodeId = parseInt(toNodeEl.dataset.nodeId);
        
        // Don't connect to self
        if (toNodeId !== mindMapConnectionState.fromNodeId) {
            // Check if connection already exists (either direction)
            const exists = mindMapConnections.some(c => 
                (c.fromNode === mindMapConnectionState.fromNodeId && c.toNode === toNodeId) ||
                (c.fromNode === toNodeId && c.toNode === mindMapConnectionState.fromNodeId)
            );
            
            if (!exists) {
                mindMapConnections.push({
                    fromNode: mindMapConnectionState.fromNodeId,
                    toNode: toNodeId
                });
                renderMindMapConnections();
            }
        }
    }
    
    document.body.style.cursor = '';
    
    // Remove temp line
    const svg = document.getElementById('mindmap-connections');
    const temp = svg.querySelector('.mindmap-connection-temp');
    if (temp) temp.remove();
    
    // Remove visual feedback
    const sourceNode = document.querySelector(`[data-node-id="${mindMapConnectionState.fromNodeId}"]`);
    if (sourceNode) {
        sourceNode.classList.remove('connecting');
    }
    
    mindMapConnectionState.isConnecting = false;
    mindMapConnectionState.fromNodeId = null;
    
    document.removeEventListener('mousemove', drawTempConnectionFromNode);
    document.removeEventListener('mousedown', endConnectionFromNode);
    document.removeEventListener('contextmenu', cancelConnection);
}

// Calculate closest point on node edge to target position
function getClosestEdgePoint(node, targetX, targetY) {
    const nodeEl = document.querySelector(`[data-node-id="${node.id}"]`);
    if (!nodeEl) return { x: node.x, y: node.y };
    
    const rect = nodeEl.getBoundingClientRect();
    const canvas = document.getElementById('mindmap-canvas');
    const canvasRect = canvas.getBoundingClientRect();
    
    const width = rect.width / mindMapScale;
    const height = rect.height / mindMapScale;
    
    // Node center
    const centerX = node.x + width / 2;
    const centerY = node.y + height / 2;
    
    // Vector from center to target
    const dx = targetX - centerX;
    const dy = targetY - centerY;
    
    // Find which edge is closest
    const ratioX = Math.abs(dx / (width / 2));
    const ratioY = Math.abs(dy / (height / 2));
    
    if (ratioX > ratioY) {
        // Left or right edge
        const x = dx > 0 ? node.x + width : node.x;
        const y = centerY;
        return { x, y };
    } else {
        // Top or bottom edge
        const x = centerX;
        const y = dy > 0 ? node.y + height : node.y;
        return { x, y };
    }
}

// Connection system
function startConnection(event, nodeId) {
    event.stopPropagation();
    event.preventDefault();
    
    console.log('Starting connection from node:', nodeId);
    
    mindMapConnectionState.isConnecting = true;
    mindMapConnectionState.fromNodeId = nodeId;
    mindMapConnectionState.fromAnchor = 'bottom-right';
    
    document.addEventListener('mousemove', drawTempConnection);
    document.addEventListener('mouseup', endConnection);
}

function drawTempConnection(event) {
    if (!mindMapConnectionState.isConnecting) return;
    
    const svg = document.getElementById('mindmap-connections');
    const fromNode = mindMapNodes.find(n => n.id === mindMapConnectionState.fromNodeId);
    if (!fromNode) return;
    
    const fromPos = getAnchorPosition(fromNode, mindMapConnectionState.fromAnchor);
    
    const canvas = document.getElementById('mindmap-canvas');
    const container = document.getElementById('mindmap-nodes');
    const rect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    // Convert mouse position to node coordinate space
    const toX = (event.clientX - containerRect.left) / mindMapScale;
    const toY = (event.clientY - containerRect.top) / mindMapScale;
    
    // Remove old temp line
    const oldTemp = svg.querySelector('.mindmap-connection-temp');
    if (oldTemp) oldTemp.remove();
    
    // Draw new temp line
    const path = createCurvePath(fromPos.x, fromPos.y, toX, toY);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', path);
    line.setAttribute('class', 'mindmap-connection-temp');
    svg.appendChild(line);
}

function endConnection(event) {
    if (!mindMapConnectionState.isConnecting) return;
    
    // Remove temp line
    const svg = document.getElementById('mindmap-connections');
    const temp = svg.querySelector('.mindmap-connection-temp');
    if (temp) temp.remove();
    
    // Check if we're over a node (anchor or node body)
    const target = event.target;
    let toNodeEl = null;
    
    if (target.classList.contains('mindmap-node-anchor')) {
        toNodeEl = target.closest('.mindmap-node');
    } else if (target.closest('.mindmap-node')) {
        toNodeEl = target.closest('.mindmap-node');
    }
    
    if (toNodeEl) {
        const toNodeId = parseInt(toNodeEl.dataset.nodeId);
        
        // Don't connect to self
        if (toNodeId !== mindMapConnectionState.fromNodeId) {
            // Check if connection already exists
            const exists = mindMapConnections.some(c => 
                c.fromNode === mindMapConnectionState.fromNodeId && c.toNode === toNodeId
            );
            
            if (!exists) {
                mindMapConnections.push({
                    fromNode: mindMapConnectionState.fromNodeId,
                    fromAnchor: 'bottom-right',
                    toNode: toNodeId,
                    toAnchor: 'center'
                });
                renderMindMapConnections();
            }
        }
    }
    
    mindMapConnectionState.isConnecting = false;
    mindMapConnectionState.fromNodeId = null;
    mindMapConnectionState.fromAnchor = null;
    
    document.removeEventListener('mousemove', drawTempConnection);
    document.removeEventListener('mouseup', endConnection);
}

function getAnchorPosition(node, anchor) {
    const nodeEl = document.querySelector(`[data-node-id="${node.id}"]`);
    if (!nodeEl) return { x: node.x + 150, y: node.y + 25 };
    
    // Get actual dimensions from the element
    const rect = nodeEl.getBoundingClientRect();
    const canvas = document.getElementById('mindmap-canvas');
    const canvasRect = canvas.getBoundingClientRect();
    
    // Get width and height without scale
    const width = rect.width / mindMapScale;
    const height = rect.height / mindMapScale;
    
    // Use node's stored x, y position directly
    if (anchor === 'bottom-right') {
        // Origin point at bottom right
        return { x: node.x + width, y: node.y + height };
    } else {
        // Destination point at center
        return { x: node.x + width / 2, y: node.y + height / 2 };
    }
}

function createCurvePath(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const offset = Math.min(dist / 2, 50);
    
    return `M ${x1} ${y1} C ${x1 + offset} ${y1}, ${x2 - offset} ${y2}, ${x2} ${y2}`;
}

function renderMindMapConnections() {
    const svg = document.getElementById('mindmap-connections');
    if (!svg) return;
    
    svg.innerHTML = '';
    
    mindMapConnections.forEach((conn, index) => {
        const fromNode = mindMapNodes.find(n => n.id === conn.fromNode);
        const toNode = mindMapNodes.find(n => n.id === conn.toNode);
        
        if (!fromNode || !toNode) return;
        
        // Get node centers
        const fromNodeEl = document.querySelector(`[data-node-id="${fromNode.id}"]`);
        const toNodeEl = document.querySelector(`[data-node-id="${toNode.id}"]`);
        
        if (!fromNodeEl || !toNodeEl) return;
        
        const fromRect = fromNodeEl.getBoundingClientRect();
        const toRect = toNodeEl.getBoundingClientRect();
        
        const fromWidth = fromRect.width / mindMapScale;
        const fromHeight = fromRect.height / mindMapScale;
        const toWidth = toRect.width / mindMapScale;
        const toHeight = toRect.height / mindMapScale;
        
        const fromCenterX = fromNode.x + fromWidth / 2;
        const fromCenterY = fromNode.y + fromHeight / 2;
        const toCenterX = toNode.x + toWidth / 2;
        const toCenterY = toNode.y + toHeight / 2;
        
        // Calculate edge points
        const fromPos = getClosestEdgePoint(fromNode, toCenterX, toCenterY);
        const toPos = getClosestEdgePoint(toNode, fromCenterX, fromCenterY);
        
        const path = createCurvePath(fromPos.x, fromPos.y, toPos.x, toPos.y);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.setAttribute('d', path);
        line.setAttribute('class', 'mindmap-connection-line');
        line.setAttribute('data-connection-index', index);
        line.onclick = (e) => {
            e.stopPropagation();
            if (confirm('Remover esta conexão?')) {
                mindMapConnections.splice(index, 1);
                renderMindMapConnections();
            }
        };
        svg.appendChild(line);
    });
}

// Auto-resize textarea
function autoResizeTextarea(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    const newHeight = Math.max(44, Math.min(textarea.scrollHeight, 200));
    textarea.style.height = newHeight + 'px';
}

// Keyboard shortcuts for mindmap nodes
function handleMindMapNodeKeydown(event, nodeId) {
    // Enter without shift: add new node
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        addMindMapNode();
    }
    // Delete/Backspace on empty: remove node
    else if ((event.key === 'Delete' || event.key === 'Backspace') && event.target.value === '') {
        event.preventDefault();
        const fakeEvent = { stopPropagation: () => {} };
        deleteMindMapNode(fakeEvent, nodeId);
    }
}

function mindMapZoomIn() {
    mindMapScale = Math.min(mindMapScale + 0.1, 2);
    applyMindMapTransform();
}

function mindMapZoomOut() {
    mindMapScale = Math.max(mindMapScale - 0.1, 0.5);
    applyMindMapTransform();
}

function mindMapResetView() {
    mindMapScale = 1;
    mindMapPanOffset = { x: 0, y: 0 };
    applyMindMapTransform();
}

function applyMindMapTransform() {
    const container = document.getElementById('mindmap-nodes');
    const svg = document.getElementById('mindmap-connections');
    
    const transform = `scale(${mindMapScale}) translate(${mindMapPanOffset.x}px, ${mindMapPanOffset.y}px)`;
    
    if (container) {
        container.style.transform = transform;
    }
    if (svg) {
        svg.style.transform = transform;
    }
    
    // Redraw connections to update positions
    renderMindMapConnections();
}

// Initialize mindmap canvas interactions
function initMindMapCanvas() {
    const canvas = document.getElementById('mindmap-canvas');
    if (!canvas) return;
    
    // Scroll wheel for zoom
    canvas.addEventListener('wheel', (event) => {
        event.preventDefault();
        
        const delta = event.deltaY;
        const zoomIntensity = 0.1;
        
        if (delta < 0) {
            // Scroll up - zoom in
            mindMapScale = Math.min(mindMapScale + zoomIntensity, 2);
        } else {
            // Scroll down - zoom out
            mindMapScale = Math.max(mindMapScale - zoomIntensity, 0.3);
        }
        
        applyMindMapTransform();
    }, { passive: false });
    
    // Pan canvas on drag
    canvas.addEventListener('mousedown', (event) => {
        // Only pan if clicking on canvas background (not on nodes)
        if (event.target === canvas || event.target.id === 'mindmap-nodes' || event.target.id === 'mindmap-connections') {
            mindMapPanState.isPanning = true;
            mindMapPanState.startX = event.clientX;
            mindMapPanState.startY = event.clientY;
            mindMapPanState.offsetX = mindMapPanOffset.x;
            mindMapPanState.offsetY = mindMapPanOffset.y;
            
            canvas.style.cursor = 'grabbing';
            
            document.addEventListener('mousemove', onCanvasPan);
            document.addEventListener('mouseup', endCanvasPan);
        }
    });
}

function onCanvasPan(event) {
    if (!mindMapPanState.isPanning) return;
    
    const deltaX = (event.clientX - mindMapPanState.startX) / mindMapScale;
    const deltaY = (event.clientY - mindMapPanState.startY) / mindMapScale;
    
    mindMapPanOffset.x = mindMapPanState.offsetX + deltaX;
    mindMapPanOffset.y = mindMapPanState.offsetY + deltaY;
    
    applyMindMapTransform();
}

function endCanvasPan() {
    mindMapPanState.isPanning = false;
    
    const canvas = document.getElementById('mindmap-canvas');
    if (canvas) canvas.style.cursor = 'grab';
    
    document.removeEventListener('mousemove', onCanvasPan);
    document.removeEventListener('mouseup', endCanvasPan);
}

// Call init when mindmap is shown
if (document.getElementById('mindmap-canvas')) {
    initMindMapCanvas();
}

// Compatibility functions
function addCascadeNode() {
    addMindMapNode();
}

function renderCascadeNodes() {
    renderMindMap();
}

function showNodeTypeModal() {
    const modal = document.getElementById('node-type-modal');
    const optionsContainer = document.getElementById('node-type-options');
    const cardType = ui.selectedType || 'evento';
    
    const types = nodeTypesByCardType[cardType] || nodeTypesByCardType.evento;
    
    optionsContainer.innerHTML = types.map(t => `
        <div class="node-type-option" onclick="createNode('${t.type}', '${t.icon}')">
            <div class="node-type-option-icon ${t.type}">${t.icon}</div>
            <div class="node-type-option-text">${t.label}</div>
        </div>
    `).join('');
    
    modal.style.display = 'flex';
}

function closeNodeTypeModal() {
    document.getElementById('node-type-modal').style.display = 'none';
}

function renderCascadeNodes() {
    const container = document.getElementById('cascade-nodes');
    const emptyMsg = document.getElementById('cascade-empty');
    
    if (!container) return;
    
    if (cascadeNodes.length === 0) {
        container.innerHTML = '';
        if (emptyMsg) emptyMsg.style.display = 'flex';
        return;
    }
    
    if (emptyMsg) emptyMsg.style.display = 'none';
    
    let html = '';
    cascadeNodes.forEach((node, index) => {
        html += renderNodeItem(node, index, null);
    });
    
    container.innerHTML = html;
}

// Utility functions
function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// =====================================================
// CONNECTION CHIPS (Card Links)
// =====================================================

function addConnectionFromSelect(selectElement) {
    const cardId = selectElement.value;
    if (!cardId) return;
    
    if (!cardConnections.includes(cardId)) {
        cardConnections.push(cardId);
        renderConnectionChips();
    }
    
    selectElement.value = '';
}

function renderConnectionChips() {
    const container = document.getElementById('connection-chips');
    if (!container) return;
    
    container.innerHTML = cardConnections.map(cardId => {
        const card = dataStore.getCard(cardId);
        if (!card) return '';
        return `
            <div class="connection-chip ${card.type}">
                <span>${ui.getTypeIcon(card.type)}</span>
                <span>${ui.escapeHtml(card.name)}</span>
                <button type="button" onclick="removeConnection('${cardId}')">×</button>
            </div>
        `;
    }).join('');
}

function removeConnection(cardId) {
    cardConnections = cardConnections.filter(id => id !== cardId);
    renderConnectionChips();
}

function clearConnections() {
    cardConnections = [];
    renderConnectionChips();
}

function setConnections(connections) {
    cardConnections = connections || [];
    renderConnectionChips();
}

// =====================================================
// RESET MINDMAP/CASCADE EDITOR
// =====================================================

function resetCascadeEditor() {
    cascadeNodes = [];
    mindMapNodes = [];
    mindMapConnections = [];
    cardConnections = [];
    mindMapScale = 1;
    mindMapPanOffset = { x: 0, y: 0 };
    renderMindMap();
    renderConnectionChips();
    applyMindMapTransform();
}

// Update resetForm to include mindmap reset
const originalResetForm = window.resetForm;
window.resetForm = function() {
    if (originalResetForm) originalResetForm();
    resetCascadeEditor();
    document.getElementById('cascade-editor-section').style.display = 'none';
    document.getElementById('connections-section').style.display = 'none';
};