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
});

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
// CASCADE EDITOR - Visual Node Builder
// =====================================================

let cascadeNodes = [];
let cardConnections = [];
let pendingNodeParent = null;

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

function addCascadeNode(parentIndex = null) {
    pendingNodeParent = parentIndex;
    showNodeTypeModal();
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
    pendingNodeParent = null;
}

function createNode(type, icon) {
    const newNode = {
        id: Date.now(),
        type: type,
        icon: icon,
        label: '',
        children: []
    };
    
    if (pendingNodeParent !== null) {
        // Add as child of parent node
        cascadeNodes[pendingNodeParent].children.push(newNode);
    } else {
        // Add to root level
        cascadeNodes.push(newNode);
    }
    
    closeNodeTypeModal();
    renderCascadeNodes();
    
    // Focus the new node's input
    setTimeout(() => {
        const inputs = document.querySelectorAll('.node-input');
        const lastInput = inputs[inputs.length - 1];
        if (lastInput) lastInput.focus();
    }, 50);
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

function renderNodeItem(node, index, parentIndex) {
    const path = parentIndex !== null ? `${parentIndex}-${index}` : `${index}`;
    
    let html = `
        <div class="cascade-node-item" data-path="${path}">
            <div class="cascade-node-main">
                <div class="node-type-badge ${node.type}">${node.icon}</div>
                <input type="text" 
                       class="node-input" 
                       value="${escapeAttr(node.label)}" 
                       placeholder="Digite aqui (max 100 chars)"
                       maxlength="100"
                       onpaste="handleNodePaste(event)"
                       onkeydown="handleNodeKeydown(event)"
                       onchange="updateNodeLabel('${path}', this.value)">
                <div class="node-actions">
                    <button type="button" class="node-action-btn" onclick="addBranchTo('${path}')" title="Ramificar">↳</button>
                    <button type="button" class="node-action-btn delete" onclick="deleteNode('${path}')" title="Remover">×</button>
                </div>
            </div>
    `;
    
    // Render children (branches)
    if (node.children && node.children.length > 0) {
        html += '<div class="node-branches">';
        node.children.forEach((child, childIndex) => {
            html += `<div class="branch-item">`;
            html += renderNodeItem(child, childIndex, path);
            html += `</div>`;
        });
        html += '</div>';
    }
    
    // Connector line if not last root node and no children
    if (parentIndex === null) {
        html += '<div class="node-connector"></div>';
    }
    
    html += '</div>';
    return html;
}

function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function handleNodePaste(event) {
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData('text');
    // Only allow max 100 chars, strip newlines
    const clean = text.replace(/[\n\r]/g, ' ').substring(0, 100);
    document.execCommand('insertText', false, clean);
}

function handleNodeKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        // Add new node after current one
        addCascadeNode();
    }
}

function updateNodeLabel(path, value) {
    const node = getNodeByPath(path);
    if (node) {
        node.label = value.substring(0, 100);
    }
}

function getNodeByPath(path) {
    const parts = path.split('-').map(Number);
    let node = cascadeNodes[parts[0]];
    
    for (let i = 1; i < parts.length; i++) {
        if (node && node.children) {
            node = node.children[parts[i]];
        }
    }
    
    return node;
}

function addBranchTo(path) {
    const parts = path.split('-').map(Number);
    pendingNodeParent = parts[0];
    
    // If it's a nested path, we need to handle it differently
    if (parts.length > 1) {
        // For now, add to the root node at the first index
        // More complex nesting would require recursive handling
    }
    
    showNodeTypeModal();
}

function deleteNode(path) {
    const parts = path.split('-').map(Number);
    
    if (parts.length === 1) {
        // Root level node
        cascadeNodes.splice(parts[0], 1);
    } else {
        // Nested node - find parent and remove child
        const parentPath = parts.slice(0, -1).join('-');
        const parent = getNodeByPath(parentPath);
        if (parent && parent.children) {
            parent.children.splice(parts[parts.length - 1], 1);
        }
    }
    
    renderCascadeNodes();
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
// RESET CASCADE EDITOR
// =====================================================

function resetCascadeEditor() {
    cascadeNodes = [];
    cardConnections = [];
    renderCascadeNodes();
    renderConnectionChips();
}

// Update resetForm to include cascade reset
const originalResetForm = window.resetForm;
window.resetForm = function() {
    if (originalResetForm) originalResetForm();
    resetCascadeEditor();
    document.getElementById('cascade-editor-section').style.display = 'none';
    document.getElementById('connections-section').style.display = 'none';
};