/**
 * src/client/ui/search-menu/search-menu-panel.ts
 *
 * Main search menu panel - displays different pages based on navigation
 */

import {
  SearchMenuCategory,
  TownInfo,
  TycoonProfile,
  RankingCategory,
  RankingEntry,
  WsMessage,
  WsMessageType,
  WsReqSearchMenuHome,
  WsRespSearchMenuHome,
  WsReqSearchMenuTowns,
  WsRespSearchMenuTowns,
  WsReqSearchMenuTycoonProfile,
  WsRespSearchMenuTycoonProfile,
  WsReqSearchMenuPeople,
  WsRespSearchMenuPeople,
  WsReqSearchMenuPeopleSearch,
  WsRespSearchMenuPeopleSearch,
  WsReqSearchMenuRankings,
  WsRespSearchMenuRankings,
  WsReqSearchMenuRankingDetail,
  WsRespSearchMenuRankingDetail,
  WsReqSearchMenuBanks,
  WsRespSearchMenuBanks
} from '../../../shared/types';

type SearchMenuPage = 'home' | 'towns' | 'profile' | 'people' | 'rankings' | 'ranking-detail' | 'banks';

export class SearchMenuPanel {
  private panel: HTMLElement;
  private titleElement: HTMLElement;
  private contentElement: HTMLElement;
  private backButton: HTMLElement;
  private closeButton: HTMLElement;
  private sendMessage: (msg: WsMessage) => void;

  private currentPage: SearchMenuPage = 'home';
  private pageHistory: SearchMenuPage[] = [];

  // Dragging state
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  constructor(sendMessage: (msg: WsMessage) => void) {
    this.sendMessage = sendMessage;
    this.panel = this.createPanel();
    this.titleElement = this.panel.querySelector('.search-menu-title')!;
    this.contentElement = this.panel.querySelector('.search-menu-content')!;
    this.backButton = this.panel.querySelector('.search-menu-back-btn')!;
    this.closeButton = this.panel.querySelector('.search-menu-close-btn')!;

    this.setupEventListeners();
  }

  private createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'search-menu-panel';
    panel.style.display = 'none';

    panel.innerHTML = `
      <div class="search-menu-header">
        <button class="search-menu-back-btn" title="Back" style="display: none;">←</button>
        <div class="search-menu-title">Search</div>
        <button class="search-menu-close-btn" title="Close">✕</button>
      </div>
      <div class="search-menu-content"></div>
    `;

    document.body.appendChild(panel);
    return panel;
  }

  private setupEventListeners(): void {
    // Close button
    this.closeButton.addEventListener('click', () => this.close());

    // Back button
    this.backButton.addEventListener('click', () => this.goBack());

    // Dragging
    const header = this.panel.querySelector('.search-menu-header') as HTMLElement;
    header.addEventListener('mousedown', (e) => this.onMouseDown(e));
    document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    document.addEventListener('mouseup', () => this.onMouseUp());

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.panel.style.display !== 'none') {
        this.close();
      }
    });
  }

  private onMouseDown(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('search-menu-close-btn') ||
        (e.target as HTMLElement).classList.contains('search-menu-back-btn')) {
      return;
    }

    this.isDragging = true;
    const rect = this.panel.getBoundingClientRect();
    this.dragOffsetX = e.clientX - rect.left;
    this.dragOffsetY = e.clientY - rect.top;
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;

    const x = e.clientX - this.dragOffsetX;
    const y = e.clientY - this.dragOffsetY;

    this.panel.style.left = `${x}px`;
    this.panel.style.top = `${y}px`;
  }

  private onMouseUp(): void {
    this.isDragging = false;
  }

  /**
   * Show the panel and load home page
   */
  public show(): void {
    this.panel.style.display = 'block';

    // Center the panel if not already positioned
    if (!this.panel.style.left) {
      const rect = this.panel.getBoundingClientRect();
      this.panel.style.left = `${(window.innerWidth - rect.width) / 2}px`;
      this.panel.style.top = `${(window.innerHeight - rect.height) / 2}px`;
    }

    this.loadHomePage();
  }

  /**
   * Close the panel
   */
  public close(): void {
    this.panel.style.display = 'none';
    this.pageHistory = [];
    this.currentPage = 'home';
    this.updateBackButton();
  }

  /**
   * Go back to previous page
   */
  private goBack(): void {
    if (this.pageHistory.length === 0) return;

    const previousPage = this.pageHistory.pop()!;
    this.currentPage = previousPage;
    this.updateBackButton();

    // Load the previous page
    switch (previousPage) {
      case 'home':
        this.loadHomePage();
        break;
      case 'towns':
        this.loadTownsPage();
        break;
      case 'people':
        this.loadPeoplePage();
        break;
      case 'rankings':
        this.loadRankingsPage();
        break;
      case 'banks':
        this.loadBanksPage();
        break;
    }
  }

  private updateBackButton(): void {
    this.backButton.style.display = this.pageHistory.length > 0 ? 'block' : 'none';
  }

  private navigateTo(page: SearchMenuPage): void {
    this.pageHistory.push(this.currentPage);
    this.currentPage = page;
    this.updateBackButton();
  }

  /**
   * Load home page with category grid
   */
  private loadHomePage(): void {
    this.titleElement.textContent = 'Search';
    this.contentElement.innerHTML = '<div class="loading">Loading...</div>';

    const request: WsReqSearchMenuHome = {
      type: WsMessageType.REQ_SEARCH_MENU_HOME
    };

    this.sendMessage(request);
  }

  /**
   * Render home page categories
   */
  public renderHomePage(data: WsRespSearchMenuHome): void {
    const categories = data.categories;

    let html = '<div class="search-menu-grid">';

    categories.forEach(cat => {
      const disabled = cat.enabled ? '' : 'disabled';
      const icon = cat.iconUrl || '';

      html += `
        <div class="search-menu-category ${disabled}" data-id="${cat.id}">
          ${icon ? `<img src="${icon}" alt="${cat.label}" class="category-icon">` : ''}
          <div class="category-label">${cat.label}</div>
        </div>
      `;
    });

    html += '</div>';
    this.contentElement.innerHTML = html;

    // Add click handlers
    this.contentElement.querySelectorAll('.search-menu-category:not(.disabled)').forEach(el => {
      el.addEventListener('click', () => {
        const id = (el as HTMLElement).dataset.id!;
        this.onCategoryClick(id);
      });
    });
  }

  private onCategoryClick(categoryId: string): void {
    switch (categoryId) {
      case 'Towns':
        this.navigateTo('towns');
        this.loadTownsPage();
        break;
      case 'RenderTycoon': // "You" uses RenderTycoon.asp
        // Load current user's profile
        this.navigateTo('profile');
        this.loadTycoonProfile('YOU'); // Special marker for current user
        break;
      case 'Tycoons': // "People" uses Tycoons.asp
        this.navigateTo('people');
        this.loadPeoplePage();
        break;
      case 'Rankings':
        this.navigateTo('rankings');
        this.loadRankingsPage();
        break;
      case 'Banks':
        this.navigateTo('banks');
        this.loadBanksPage();
        break;
      default:
        console.warn('[SearchMenuPanel] Unknown category:', categoryId);
    }
  }

  /**
   * Load towns list page
   */
  private loadTownsPage(): void {
    this.titleElement.textContent = 'Towns';
    this.contentElement.innerHTML = '<div class="loading">Loading...</div>';

    const request: WsReqSearchMenuTowns = {
      type: WsMessageType.REQ_SEARCH_MENU_TOWNS
    };

    this.sendMessage(request);
  }

  /**
   * Render towns list
   */
  public renderTownsPage(data: WsRespSearchMenuTowns): void {
    const towns = data.towns;

    let html = '<div class="search-menu-list">';

    towns.forEach(town => {
      html += `
        <div class="town-item">
          <img src="${town.iconUrl}" alt="${town.name}" class="town-icon">
          <div class="town-info">
            <div class="town-name">${town.name}</div>
            <div class="town-stats">
              <div>Mayor: ${town.mayor || '<span style="color: red">none</span>'}</div>
              <div>${town.population.toLocaleString()} inhabitants (${town.unemploymentPercent}% UE)</div>
              <div>QoL: ${town.qualityOfLife}%</div>
              <div><a href="#" class="show-in-map" data-x="${town.x}" data-y="${town.y}">Show in map</a></div>
            </div>
          </div>
        </div>
      `;
    });

    html += '</div>';
    this.contentElement.innerHTML = html;

    // Add map navigation handlers
    this.contentElement.querySelectorAll('.show-in-map').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const x = parseInt((el as HTMLElement).dataset.x!);
        const y = parseInt((el as HTMLElement).dataset.y!);
        this.onShowInMap(x, y);
      });
    });
  }

  /**
   * Load tycoon profile page
   */
  private loadTycoonProfile(tycoonName: string): void {
    this.titleElement.textContent = 'Profile';
    this.contentElement.innerHTML = '<div class="loading">Loading...</div>';

    const request: WsReqSearchMenuTycoonProfile = {
      type: WsMessageType.REQ_SEARCH_MENU_TYCOON_PROFILE,
      tycoonName
    };

    this.sendMessage(request);
  }

  /**
   * Render tycoon profile
   */
  public renderTycoonProfile(data: WsRespSearchMenuTycoonProfile): void {
    const profile = data.profile;

    const html = `
      <div class="tycoon-profile">
        <h2>${profile.name}</h2>
        <img src="${profile.photoUrl}" alt="${profile.name}" class="tycoon-photo">
        <div class="tycoon-stats">
          <div><strong>Fortune:</strong> $${profile.fortune.toLocaleString()}</div>
          <div><strong>This year:</strong> $${profile.thisYearProfit.toLocaleString()}</div>
          <div><strong>NTA Ranking:</strong> ${profile.ntaRanking}</div>
          <div><strong>Level:</strong> ${profile.level}</div>
          <div><strong>Prestige:</strong> ${profile.prestige} points</div>
        </div>
      </div>
    `;

    this.contentElement.innerHTML = html;
  }

  /**
   * Load people search page
   */
  private loadPeoplePage(): void {
    this.titleElement.textContent = 'People';

    const html = `
      <div class="people-search">
        <h3>Search</h3>
        <div class="search-form">
          <input type="text" class="search-input" placeholder="Enter name...">
          <button class="search-btn">Search</button>
        </div>
        <h3>Index</h3>
        <div class="alphabet-index">
          ${Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ').map(letter =>
            `<a href="#" class="letter-link" data-letter="${letter}">${letter}</a>`
          ).join(' ')}
        </div>
        <div class="search-results"></div>
      </div>
    `;

    this.contentElement.innerHTML = html;

    // Add search handlers
    const searchInput = this.contentElement.querySelector('.search-input') as HTMLInputElement;
    const searchBtn = this.contentElement.querySelector('.search-btn') as HTMLButtonElement;
    const resultsContainer = this.contentElement.querySelector('.search-results') as HTMLElement;

    const performSearch = () => {
      const query = searchInput.value.trim();
      if (!query) return;

      resultsContainer.innerHTML = '<div class="loading">Searching...</div>';

      const request: WsReqSearchMenuPeopleSearch = {
        type: WsMessageType.REQ_SEARCH_MENU_PEOPLE_SEARCH,
        searchStr: query
      };

      this.sendMessage(request);
    };

    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') performSearch();
    });

    // Letter index handlers
    this.contentElement.querySelectorAll('.letter-link').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const letter = (el as HTMLElement).dataset.letter!;
        searchInput.value = letter;
        performSearch();
      });
    });
  }

  /**
   * Render people search results
   */
  public renderPeopleSearchResults(data: WsRespSearchMenuPeopleSearch): void {
    const results = data.results;
    const resultsContainer = this.contentElement.querySelector('.search-results') as HTMLElement;

    if (results.length === 0) {
      resultsContainer.innerHTML = '<div class="no-results">No results found</div>';
      return;
    }

    let html = '<div class="search-menu-list">';
    results.forEach(name => {
      html += `
        <div class="person-item">
          <a href="#" class="person-name" data-name="${name}">${name}</a>
        </div>
      `;
    });
    html += '</div>';

    resultsContainer.innerHTML = html;

    // Add click handlers to view profiles
    resultsContainer.querySelectorAll('.person-name').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const name = (el as HTMLElement).dataset.name!;
        this.navigateTo('profile');
        this.loadTycoonProfile(name);
      });
    });
  }

  /**
   * Load rankings page
   */
  private loadRankingsPage(): void {
    this.titleElement.textContent = 'Rankings';
    this.contentElement.innerHTML = '<div class="loading">Loading...</div>';

    const request: WsReqSearchMenuRankings = {
      type: WsMessageType.REQ_SEARCH_MENU_RANKINGS
    };

    this.sendMessage(request);
  }

  /**
   * Render rankings tree
   */
  public renderRankingsPage(data: WsRespSearchMenuRankings): void {
    const categories = data.categories;

    const renderCategory = (cat: RankingCategory, level: number = 0): string => {
      const hasChildren = cat.children && cat.children.length > 0;
      const leafClass = hasChildren ? '' : 'leaf';
      const expandedClass = level === 0 ? 'expanded' : ''; // Level 0 starts expanded

      let html = `
        <div class="ranking-category level-${level} ${leafClass} ${expandedClass}" data-url="${cat.url}">
          <div class="ranking-category-header">
            <span class="ranking-expand-icon">▶</span>
            <a href="#" class="ranking-link" data-url="${cat.url}">${cat.label}</a>
          </div>
      `;

      if (hasChildren) {
        html += '<div class="ranking-children">';
        cat.children!.forEach(child => {
          html += renderCategory(child, level + 1);
        });
        html += '</div>';
      }

      html += '</div>';
      return html;
    };

    let html = '<div class="rankings-tree">';
    categories.forEach(cat => {
      html += renderCategory(cat);
    });
    html += '</div>';

    this.contentElement.innerHTML = html;

    // Add expand/collapse handlers
    this.contentElement.querySelectorAll('.ranking-category-header').forEach(header => {
      header.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        // If clicked on the link, let it navigate
        if (target.classList.contains('ranking-link')) {
          e.preventDefault();
          const url = target.dataset.url!;
          this.loadRankingDetail(url);
          return;
        }

        // Otherwise, toggle expand/collapse
        const categoryDiv = header.parentElement as HTMLElement;
        if (!categoryDiv.classList.contains('leaf')) {
          e.preventDefault();
          categoryDiv.classList.toggle('expanded');
        }
      });
    });
  }

  /**
   * Load ranking detail page
   */
  private loadRankingDetail(rankingPath: string): void {
    this.navigateTo('ranking-detail');
    this.titleElement.textContent = 'Ranking';
    this.contentElement.innerHTML = '<div class="loading">Loading...</div>';

    const request: WsReqSearchMenuRankingDetail = {
      type: WsMessageType.REQ_SEARCH_MENU_RANKING_DETAIL,
      rankingPath
    };

    this.sendMessage(request);
  }

  /**
   * Render ranking detail
   */
  public renderRankingDetail(data: WsRespSearchMenuRankingDetail): void {
    this.titleElement.textContent = data.title;
    const entries = data.entries;

    let html = '<div class="ranking-detail">';

    // Top 3 with photos
    const top3 = entries.filter(e => e.photoUrl).slice(0, 3);
    if (top3.length > 0) {
      html += '<div class="top-three">';
      top3.forEach(entry => {
        html += `
          <div class="top-entry">
            <img src="${entry.photoUrl}" alt="${entry.name}" class="top-photo">
            <div class="top-rank">${entry.rank}. ${entry.name}</div>
            <div class="top-value">${entry.value.toLocaleString()}</div>
          </div>
        `;
      });
      html += '</div>';
    }

    // Remaining entries
    const remaining = entries.filter(e => !e.photoUrl || entries.indexOf(e) >= 3);
    if (remaining.length > 0) {
      html += '<div class="ranking-list">';
      remaining.forEach(entry => {
        html += `
          <div class="ranking-entry">
            <span class="rank">${entry.rank}</span>
            <span class="name">${entry.name}</span>
            <span class="value">${entry.value.toLocaleString()}</span>
          </div>
        `;
      });
      html += '</div>';
    }

    html += '</div>';
    this.contentElement.innerHTML = html;
  }

  /**
   * Load banks page
   */
  private loadBanksPage(): void {
    this.titleElement.textContent = 'Banks';
    this.contentElement.innerHTML = '<div class="loading">Loading...</div>';

    const request: WsReqSearchMenuBanks = {
      type: WsMessageType.REQ_SEARCH_MENU_BANKS
    };

    this.sendMessage(request);
  }

  /**
   * Render banks page
   */
  public renderBanksPage(data: WsRespSearchMenuBanks): void {
    if (data.banks.length === 0) {
      this.contentElement.innerHTML = '<div class="no-results">No banks available</div>';
    } else {
      // Future: render banks list
      this.contentElement.innerHTML = '<div class="no-results">Banks feature coming soon</div>';
    }
  }

  /**
   * Handle "Show in map" clicks
   */
  private onShowInMap(x: number, y: number): void {
    // Close the search panel
    this.close();

    // Dispatch custom event for map navigation
    window.dispatchEvent(new CustomEvent('navigate-to-map', {
      detail: { x, y }
    }));
  }
}
