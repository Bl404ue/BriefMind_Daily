// Global variables
let preloadedData = {
    wechatArticles: null,
    papers: null,
    fields: new Set(),
    institutions: new Set(),
    currentFieldFilter: 'all',
    currentInstitutionFilter: 'all'
};

// 预定义的领域和机构列表
const PREDEFINED_FIELDS = ['LLM', 'Diffusion Model', 'Multimodal LLM', 'Embodied AI', 'Agent', 'AGI', 'Other'];
const PREDEFINED_INSTITUTIONS = ['DeepMind', 'Meta', 'Google', 'Microsoft', 'OpenAI', 'Shanghai AI Lab', 'ByteDance', 'THU', 'PKU', 'Tencent', 'Alibaba', 'Amazon', 'Other'];

// Constants
const CACHE_EXPIRATION = 30 * 60 * 1000; // 30 minutes in milliseconds
const CACHE_KEYS = {
    WECHAT_ARTICLES: 'wechatArticles',
    PAPERS: 'papers',
    LAST_UPDATED: 'lastUpdated'
};

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// 清理Markdown格式的函数
function cleanMarkdown(text) {
    if (!text) return '';
    
    // 只移除标题和链接格式，保留其他 Markdown 格式
    let cleaned = text.replace(/#{1,6}\s+/g, '');          // 移除标题 # Heading
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // 移除链接 [text](url)
    
    return cleaned;
}

// DOM Ready
document.addEventListener('DOMContentLoaded', function() {
    // Clear local storage if it's older than the expiration time
    clearExpiredCache();
    
    // Check if templates exist
    if (!document.getElementById('article-template') || !document.getElementById('paper-template')) {
        console.error('Templates not found');
        return;
    }
    
    // 初始化预定义的领域和机构列表
    initPredefinedFieldsAndInstitutions();
    
    // Initialize navigation effects
    initNavbarScroll();
    
    // Preload data
    preloadData();
    
    // Initialize smooth scrolling
    initSmoothScroll();
    
    // Add event listener for notes toggle buttons
    document.addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('toggle-notes-btn') || 
            (e.target.parentElement && e.target.parentElement.classList.contains('toggle-notes-btn'))) {
            
            const button = e.target.classList.contains('toggle-notes-btn') ? e.target : e.target.parentElement;
            const paperId = button.getAttribute('data-paper-id');
            const notesContainer = document.getElementById(`paper-notes-${paperId}`);
            
            if (notesContainer) {
                toggleNotes(button, notesContainer, paperId);
            }
        }
    });
    
    // 初始化筛选器事件监听
    initFilters();
    
    // 立即填充筛选器选项
    populateFilterOptions();
    
    // 加载HuggingFace论文
    loadHuggingFacePapers();
});

// Toggle notes visibility
function toggleNotes(button, notesContainer, paperId) {
    const isActive = notesContainer.classList.contains('active');
    
    if (isActive) {
        // Hide notes
        notesContainer.classList.remove('active');
        button.innerHTML = '<i class="fas fa-book-open"></i> 展开笔记';
    } else {
        // Show notes
        notesContainer.classList.add('active');
        button.innerHTML = '<i class="fas fa-book"></i> 收起笔记';
        
        // If notes are empty, load them
        if (notesContainer.innerHTML.trim() === '' || notesContainer.querySelector('.notes-loading')) {
            loadPaperNotes(paperId, notesContainer);
        }
    }
}

// Load paper notes
function loadPaperNotes(paperId, notesContainer) {
    // Show loading spinner
    notesContainer.innerHTML = '<div class="notes-loading"><div class="spinner"></div></div>';
    
    // Find the paper in preloaded data
    const paper = preloadedData.papers.find(p => p.id === paperId);
    
    if (paper && paper.notes) {
        // Use setTimeout to simulate loading (can be removed in production)
        setTimeout(() => {
            // 使用 marked.js 渲染 Markdown 内容
            if (window.marked) {
                notesContainer.innerHTML = marked.parse(paper.notes);
            } else {
                // 如果 marked.js 不可用，使用简单的 HTML 转换
                const html = paper.notes
                    .replace(/\n/g, '<br>')
                    .replace(/^\* (.*?)$/gm, '<li>$1</li>')
                    .replace(/(<li>.*?<\/li>\n?)+/g, '<ul>$&</ul>');
                notesContainer.innerHTML = html;
            }
        }, 300);
    } else {
        notesContainer.innerHTML = '<p>无法加载笔记内容</p>';
    }
}

// Initialize navbar scroll effect
function initNavbarScroll() {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;
    
    window.addEventListener('scroll', throttle(function() {
        if (window.scrollY > 50) {
            navbar.classList.add('navbar-scrolled');
        } else {
            navbar.classList.remove('navbar-scrolled');
        }
    }, 100));
}

// Initialize smooth scrolling for anchor links
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 70,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// Preload data from API
function preloadData() {
    // 确保fields和institutions始终是Set对象
    if (!(preloadedData.fields instanceof Set)) {
        preloadedData.fields = new Set();
    }
    if (!(preloadedData.institutions instanceof Set)) {
        preloadedData.institutions = new Set();
    }
    
    // Try to get data from cache first
    const cachedData = getCachedData();
    
    if (cachedData) {
        // 保留fields和institutions的Set类型
        const fields = preloadedData.fields;
        const institutions = preloadedData.institutions;
        
        preloadedData = cachedData;
        
        // 恢复Set类型
        preloadedData.fields = fields;
        preloadedData.institutions = institutions;
        
        renderData();
    }
    
    // Always fetch fresh data
    fetchWechatArticles();
    fetchPapers();
}

// Fetch WeChat articles
function fetchWechatArticles() {
    console.log('Fetching WeChat articles...');
    fetch('wechat_articles.csv')
        .then(response => {
            console.log('WeChat articles response status:', response.status);
            return response.text();
        })
        .then(csvText => {
            console.log('Raw CSV text length:', csvText.length); // 添加原始CSV内容长度日志
            
            // Parse CSV text
            const lines = csvText.split('\n');
            console.log('CSV lines count:', lines.length); // 添加分行后的行数日志
            
            // 确保至少有标题行
            if (lines.length < 1) {
                throw new Error('CSV file is empty or invalid');
            }
            
            const headers = lines[0].split(',');
            console.log('CSV headers:', headers); // 添加表头日志
            
            // 改进CSV解析逻辑，处理引号内的逗号
            const articles = [];
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line === '') continue; // 跳过空行
                
                console.log(`Processing line ${i}:`, line.substring(0, 50) + '...'); // 添加每行处理日志（只显示前50个字符）
                
                // 使用更可靠的CSV解析方法
                const values = parseCSVLine(line);
                console.log(`Line ${i} parsed values:`, values.length); // 添加解析后的值数量
                
                if (values.length !== headers.length) {
                    console.warn(`Line ${i} has ${values.length} values, expected ${headers.length}`);
                    // 如果值的数量不匹配，尝试调整
                    if (values.length < headers.length) {
                        // 如果值少于标题，添加空值
                        while (values.length < headers.length) {
                            values.push('');
                        }
                    } else {
                        // 如果值多于标题，截断
                        values.length = headers.length;
                    }
                }
                
                const article = {};
                
                // 字段映射
                const fieldMap = {
                    '公众号': 'source',
                    '发布时间': 'date',
                    '原标题': 'title',
                    '科技报告标题': 'report_title',
                    '一句话总结': 'brief_summary',
                    '摘要': 'summary',
                    'URL': 'url',
                    '领域分类': 'field',
                    '研究机构': 'institution'
                };
                
                headers.forEach((header, index) => {
                    const value = values[index];
                    // 移除可能存在的引号并清理空格
                    const cleanValue = value ? value.replace(/^"|"$/g, '').trim() : '';
                    const mappedField = fieldMap[header.trim()] || header.trim();
                    article[mappedField] = cleanValue;
                });
                
                articles.push(article);
            }
            
            console.log('Processed WeChat articles:', articles.length); // 添加处理后的文章数量日志
            preloadedData.wechatArticles = articles;
            
            // 使用预定义的领域和机构列表，而不是从CSV提取
            initPredefinedFieldsAndInstitutions();
            
            // 更新筛选器选项
            populateFilterOptions();
            
            updateCache();
            renderWechatArticles(articles);
        })
        .catch(error => {
            console.error('Error fetching WeChat articles:', error);
            document.getElementById('wechat-articles-container').innerHTML = 
                '<div class="alert alert-danger">加载微信文章失败: ' + error.message + '</div>';
            
            // 即使加载文章失败，也初始化预定义的领域和机构列表
            initPredefinedFieldsAndInstitutions();
            populateFilterOptions();
        });
}

// 解析CSV行，正确处理引号内的逗号
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            // 处理引号
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                // 双引号转义为单引号
                current += '"';
                i++; // 跳过下一个引号
            } else {
                // 切换引号状态
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // 逗号分隔，但不在引号内
            result.push(current);
            current = '';
        } else {
            // 普通字符
            current += char;
        }
    }
    
    // 添加最后一个字段
    result.push(current);
    
    return result;
}

// Fetch papers
function fetchPapers() {
    fetch('processed_papers.json')
        .then(response => response.json())
        .then(data => {
            preloadedData.papers = data;
            updateCache();
            renderPapers();
        })
        .catch(error => {
            console.error('Error fetching papers:', error);
            document.getElementById('papers-container').innerHTML = 
                '<div class="alert alert-danger">加载论文失败</div>';
        });
}

// Render all data
function renderData() {
    if (preloadedData.wechatArticles) {
        renderWechatArticles(preloadedData.wechatArticles);
    }
    
    if (preloadedData.papers) {
        renderPapers();
    }
}

// Render WeChat articles
function renderWechatArticles(articles) {
    console.log('Rendering wechat articles:', articles);
    const container = document.getElementById('wechat-articles-container');
    const template = document.getElementById('article-template');
    
    // 清空容器
    container.innerHTML = '';
    
    if (!articles || articles.length === 0) {
        container.innerHTML = '<div class="col-12 text-center"><p>暂无文章</p></div>';
        return;
    }
    
    // 遍历文章数据
    articles.forEach(article => {
        // 克隆模板
        const articleElement = template.content.cloneNode(true).querySelector('.col-12');
        
        // 设置文章数据
        const titleElement = articleElement.querySelector('.article-title');
        if (titleElement) {
            titleElement.textContent = article.report_title || article.title || '无标题';
            titleElement.href = article.url || '#';
            titleElement.style.color = '#0a2d6e';
        }
        
        // 设置原标题
        const originalTitleElement = articleElement.querySelector('.original-title');
        if (originalTitleElement && article.title && article.report_title && article.title !== article.report_title) {
            originalTitleElement.textContent = article.title;
        }
        
        // 设置公众号来源
        const sourceElement = articleElement.querySelector('.article-source');
        if (sourceElement && article.source) {
            sourceElement.textContent = article.source;
        }
        
        // 设置领域分类
        const fieldElement = articleElement.querySelector('.article-field');
        if (fieldElement && article.field) {
            fieldElement.textContent = article.field;
        }
        
        // 设置机构标签（支持多个机构）
        const institutionTagsContainer = articleElement.querySelector('.institution-tags');
        if (institutionTagsContainer && article.institution) {
            // 分割机构名称（按逗号分隔）
            const institutions = article.institution.split(',').map(inst => inst.trim()).filter(inst => inst);
            
            // 为每个机构创建标签
            institutions.forEach(institution => {
                const tagElement = document.createElement('span');
                tagElement.className = 'institution-tag';
                tagElement.textContent = institution;
                institutionTagsContainer.appendChild(tagElement);
            });
        }
        
        // 设置摘要预览
        const summaryTextElement = articleElement.querySelector('.summary-text');
        const summaryPreviewContainer = articleElement.querySelector('.summary-preview');
        
        if (summaryTextElement && article.summary) {
            // 使用固定字数限制，不再尝试自适应
            // 移动设备显示更少字符
            const isMobile = window.innerWidth < 768;
            const maxLength = isMobile ? 40 : 60;
            
            if (article.summary.length > maxLength) {
                summaryTextElement.textContent = article.summary.substring(0, maxLength) + '...';
            } else {
                summaryTextElement.textContent = article.summary;
            }
            
            // 确保预览容器显示
            if (summaryPreviewContainer) {
                summaryPreviewContainer.style.display = 'flex';
            }
        } else if (summaryTextElement) {
            summaryTextElement.textContent = '无摘要';
        }
        
        // 设置完整摘要
        const summaryContentElement = articleElement.querySelector('.summary-content');
        if (summaryContentElement) {
            summaryContentElement.textContent = article.summary || '无摘要';
        }
        
        // 添加展开摘要按钮事件
        const toggleButton = articleElement.querySelector('.toggle-summary-btn');
        const summaryContainer = articleElement.querySelector('.summary-container');
        
        if (toggleButton && summaryContainer && summaryPreviewContainer) {
            toggleButton.addEventListener('click', function() {
                // 展开摘要：隐藏预览，显示完整内容
                summaryContainer.style.display = 'block';
                summaryPreviewContainer.style.display = 'none';
            });
        }
        
        // 添加收起摘要按钮事件
        const collapseButton = articleElement.querySelector('.collapse-summary-btn');
        if (collapseButton && summaryContainer && summaryPreviewContainer) {
            collapseButton.addEventListener('click', function() {
                // 收起摘要：显示预览，隐藏完整内容
                summaryContainer.style.display = 'none';
                summaryPreviewContainer.style.display = 'flex';
            });
        }
        
        // 添加到容器
        container.appendChild(articleElement);
    });
}

// Render papers
function renderPapers() {
    const container = document.getElementById('papers-container');
    const template = document.getElementById('article-template'); // Use the same template as WeChat articles
    
    if (!container || !template || !preloadedData.papers) {
        return;
    }
    
    // Clear loading indicator
    container.innerHTML = '';
    
    if (preloadedData.papers.length === 0) {
        container.innerHTML = '<div class="alert alert-info">暂无论文</div>';
        return;
    }
    
    // Create a grid container for papers
    const gridContainer = document.createElement('div');
    gridContainer.id = 'papers-grid-container';
    gridContainer.style.width = '100%'; // 确保容器宽度为100%
    
    container.appendChild(gridContainer);
    
    // Clone and populate template for each paper
    preloadedData.papers.forEach((paper, index) => {
        // Create a wrapper div
        const wrapperDiv = document.createElement('div');
        wrapperDiv.className = 'paper-card-wrapper';
        wrapperDiv.style.width = '100%'; // 确保卡片宽度为100%
        
        // Clone the article template
        const paperElement = template.content.cloneNode(true);
        
        // Get the article card
        const articleCard = paperElement.querySelector('.article-card');
        articleCard.classList.add('paper-card'); // Add paper-card class
        articleCard.style.width = '100%'; // 确保卡片宽度为100%
        
        // 修改卡片容器的宽度
        const cardContainer = paperElement.querySelector('.col-lg-6');
        if (cardContainer) {
            cardContainer.className = 'col-12'; // 将col-lg-6改为col-12，确保占据整行
        }
        
        // Set paper data
        const titleElement = paperElement.querySelector('.article-title');
        if (titleElement) {
            // 清理标题中的Markdown格式
            titleElement.textContent = cleanMarkdown(paper.title) || '无标题';
            titleElement.href = paper.url || '#';
            titleElement.style.color = '#0a2d6e'; // 确保标题颜色为深蓝色
        }
        
        const dateElement = paperElement.querySelector('.article-date');
        if (dateElement) {
            dateElement.innerHTML = '<i class="fas fa-calendar"></i> ' + (paper.submission_date || '未知日期');
        }
        
        // 替换作者信息为来源信息
        const authorElement = paperElement.querySelector('.article-author');
        if (authorElement) {
            authorElement.innerHTML = '<i class="fas fa-database"></i> ' + (paper.source || 'AlphaXiv');
            authorElement.classList.add('paper-source');
        }
        
        // 设置一句话总结，清理Markdown格式
        const oneSentenceElement = paperElement.querySelector('.one-sentence');
        if (oneSentenceElement) {
            oneSentenceElement.textContent = cleanMarkdown(paper.brief_summary) || '无一句话总结';
        }
        
        // 移除详细摘要的显示
        const summaryElement = paperElement.querySelector('.summary');
        if (summaryElement) {
            summaryElement.style.display = 'none'; // 隐藏原始abstract
        }
        
        // 添加阅读笔记按钮
        const summaryContainer = paperElement.querySelector('.summary-container');
        if (summaryContainer) {
            // 调整摘要容器样式
            summaryContainer.style.backgroundColor = 'transparent';
            summaryContainer.style.padding = '10px 0';
            
            const notesBtn = document.createElement('button');
            notesBtn.className = 'read-notes-btn';
            notesBtn.innerHTML = '<i class="fas fa-book-open"></i> 展开笔记';
            notesBtn.setAttribute('data-paper-id', index);
            summaryContainer.appendChild(notesBtn);
            
            // 添加阅读笔记容器
            const notesContainer = document.createElement('div');
            notesContainer.className = 'paper-notes-container';
            notesContainer.id = `paper-notes-${index}`;
            
            // 如果有笔记内容，则添加到容器中
            if (paper.notes) {
                // 清理笔记内容中的Markdown格式
                const cleanedNotes = cleanMarkdown(paper.notes);
                
                // 使用marked.js渲染Markdown内容（如果可用）
                if (window.marked) {
                    notesContainer.innerHTML = marked.parse(cleanedNotes);
                } else {
                    // 简单的HTML转换
                    const html = cleanedNotes
                        .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
                        .replace(/^\* (.*$)/gm, '<li>$1</li>')
                        .replace(/<\/li>\n<li>/g, '</li><li>')
                        .replace(/^\n<li>/g, '<ul><li>')
                        .replace(/<\/li>\n\n/g, '</li></ul>');
                    
                    notesContainer.innerHTML = html;
                }
            } else {
                notesContainer.innerHTML = '<p>无阅读笔记</p>';
            }
            
            summaryContainer.appendChild(notesContainer);
            
            // 添加点击事件
            notesBtn.addEventListener('click', function() {
                const notesContainer = document.getElementById(`paper-notes-${this.getAttribute('data-paper-id')}`);
                if (notesContainer.classList.contains('active')) {
                    notesContainer.classList.remove('active');
                    this.innerHTML = '<i class="fas fa-book-open"></i> 展开笔记';
                } else {
                    notesContainer.classList.add('active');
                    this.innerHTML = '<i class="fas fa-book"></i> 收起笔记';
                }
            });
        }
        
        // Add to wrapper
        wrapperDiv.appendChild(paperElement);
        
        // Add to grid container
        gridContainer.appendChild(wrapperDiv);
    });
}

// Format date
function formatDate(dateString) {
    if (!dateString) return '未知日期';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (e) {
        return dateString;
    }
}

// Cache management
function updateCache() {
    try {
        localStorage.setItem(CACHE_KEYS.WECHAT_ARTICLES, JSON.stringify(preloadedData.wechatArticles));
        localStorage.setItem(CACHE_KEYS.PAPERS, JSON.stringify(preloadedData.papers));
        localStorage.setItem(CACHE_KEYS.LAST_UPDATED, Date.now().toString());
    } catch (e) {
        console.warn('Failed to update cache:', e);
    }
}

function getCachedData() {
    try {
        const lastUpdated = localStorage.getItem(CACHE_KEYS.LAST_UPDATED);
        if (!lastUpdated || Date.now() - parseInt(lastUpdated) > CACHE_EXPIRATION) {
            return null;
        }
        
        const cachedData = {
            wechatArticles: JSON.parse(localStorage.getItem(CACHE_KEYS.WECHAT_ARTICLES)),
            papers: JSON.parse(localStorage.getItem(CACHE_KEYS.PAPERS)),
            fields: new Set(),
            institutions: new Set(),
            currentFieldFilter: 'all',
            currentInstitutionFilter: 'all'
        };
        
        return cachedData;
    } catch (e) {
        console.warn('Failed to get cached data:', e);
        return null;
    }
}

function clearExpiredCache() {
    try {
        const lastUpdated = localStorage.getItem(CACHE_KEYS.LAST_UPDATED);
        if (!lastUpdated || Date.now() - parseInt(lastUpdated) > CACHE_EXPIRATION) {
            localStorage.removeItem(CACHE_KEYS.WECHAT_ARTICLES);
            localStorage.removeItem(CACHE_KEYS.PAPERS);
            localStorage.removeItem(CACHE_KEYS.LAST_UPDATED);
        }
    } catch (e) {
        console.warn('Failed to clear expired cache:', e);
    }
}

// 初始化筛选器
function initFilters() {
    // 获取筛选器元素
    const fieldFilter = document.getElementById('field-filter');
    const institutionFilter = document.getElementById('institution-filter');
    const resetFiltersBtn = document.getElementById('reset-filters');
    
    // 添加事件监听
    if (fieldFilter) {
        fieldFilter.addEventListener('change', function() {
            preloadedData.currentFieldFilter = this.value;
            applyFilters();
        });
    }
    
    if (institutionFilter) {
        institutionFilter.addEventListener('change', function() {
            preloadedData.currentInstitutionFilter = this.value;
            applyFilters();
        });
    }
    
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', function() {
            resetFilters();
        });
    }
}

// 重置筛选器
function resetFilters() {
    const fieldFilter = document.getElementById('field-filter');
    const institutionFilter = document.getElementById('institution-filter');
    
    if (fieldFilter) fieldFilter.value = 'all';
    if (institutionFilter) institutionFilter.value = 'all';
    
    preloadedData.currentFieldFilter = 'all';
    preloadedData.currentInstitutionFilter = 'all';
    
    applyFilters();
}

// 应用筛选
function applyFilters() {
    if (!preloadedData.wechatArticles) return;
    
    // 获取筛选后的文章
    const filteredArticles = preloadedData.wechatArticles.filter(article => {
        // 检查领域筛选
        const fieldMatch = preloadedData.currentFieldFilter === 'all' || 
                          article.field === preloadedData.currentFieldFilter;
        
        // 检查机构筛选
        let institutionMatch = preloadedData.currentInstitutionFilter === 'all';
        
        if (!institutionMatch && article.institution) {
            const institutions = article.institution.split(',').map(inst => inst.trim());
            institutionMatch = institutions.includes(preloadedData.currentInstitutionFilter);
        }
        
        return fieldMatch && institutionMatch;
    });
    
    // 更新筛选信息
    updateFilterInfo(filteredArticles.length);
    
    // 渲染筛选后的文章
    renderWechatArticles(filteredArticles);
}

// 更新筛选信息
function updateFilterInfo(count) {
    const filterInfo = document.getElementById('filter-info');
    if (!filterInfo) return;
    
    const totalCount = preloadedData.wechatArticles ? preloadedData.wechatArticles.length : 0;
    
    if (preloadedData.currentFieldFilter === 'all' && preloadedData.currentInstitutionFilter === 'all') {
        filterInfo.textContent = `显示全部 ${totalCount} 篇文章`;
    } else {
        let filterText = '筛选条件: ';
        
        if (preloadedData.currentFieldFilter !== 'all') {
            filterText += `领域: ${preloadedData.currentFieldFilter}`;
        }
        
        if (preloadedData.currentInstitutionFilter !== 'all') {
            if (preloadedData.currentFieldFilter !== 'all') {
                filterText += ', ';
            }
            filterText += `机构: ${preloadedData.currentInstitutionFilter}`;
        }
        
        filterInfo.textContent = `${filterText} (${count}/${totalCount})`;
    }
}

// 初始化预定义的领域和机构
function initPredefinedFieldsAndInstitutions() {
    // 确保fields和institutions是Set对象
    if (!(preloadedData.fields instanceof Set)) {
        preloadedData.fields = new Set();
    } else {
        preloadedData.fields.clear();
    }
    
    if (!(preloadedData.institutions instanceof Set)) {
        preloadedData.institutions = new Set();
    } else {
        preloadedData.institutions.clear();
    }
    
    // 添加预定义的领域
    PREDEFINED_FIELDS.forEach(field => {
        preloadedData.fields.add(field);
    });
    
    // 添加预定义的机构
    PREDEFINED_INSTITUTIONS.forEach(institution => {
        preloadedData.institutions.add(institution);
    });
    
    console.log('Initialized predefined fields:', Array.from(preloadedData.fields));
    console.log('Initialized predefined institutions:', Array.from(preloadedData.institutions));
}

// 填充筛选器选项
function populateFilterOptions() {
    const fieldFilter = document.getElementById('field-filter');
    const institutionFilter = document.getElementById('institution-filter');
    
    // 确保fields和institutions是Set对象
    if (!(preloadedData.fields instanceof Set)) {
        preloadedData.fields = new Set();
    }
    
    if (!(preloadedData.institutions instanceof Set)) {
        preloadedData.institutions = new Set();
    }
    
    console.log('Populating filter options');
    console.log('Fields:', Array.from(preloadedData.fields).length);
    console.log('Institutions:', Array.from(preloadedData.institutions).length);
    
    if (fieldFilter) {
        // 清空现有选项（保留"全部"选项）
        while (fieldFilter.options.length > 1) {
            fieldFilter.remove(1);
        }
        
        // 使用预定义的顺序添加领域选项，而不是按字母排序
        PREDEFINED_FIELDS.forEach(field => {
            const option = document.createElement('option');
            option.value = field;
            option.textContent = field;
            fieldFilter.appendChild(option);
        });
        
        console.log('Added', PREDEFINED_FIELDS.length, 'field options');
    }
    
    if (institutionFilter) {
        // 清空现有选项（保留"全部"选项）
        while (institutionFilter.options.length > 1) {
            institutionFilter.remove(1);
        }
        
        // 使用预定义的顺序添加机构选项，而不是按字母排序
        PREDEFINED_INSTITUTIONS.forEach(institution => {
            const option = document.createElement('option');
            option.value = institution;
            option.textContent = institution;
            institutionFilter.appendChild(option);
        });
        
        console.log('Added', PREDEFINED_INSTITUTIONS.length, 'institution options');
    }
}

// 加载HuggingFace论文数据
async function loadHuggingFacePapers() {
    try {
        const response = await fetch('huggingface_papers.csv');
        const data = await response.text();
        
        console.log('HuggingFace CSV 加载成功，长度:', data.length);
        
        // 解析CSV数据
        const papers = parseHuggingFaceCSV(data);
        console.log(`成功解析 ${papers.length} 篇HuggingFace论文`);
        
        // 按Upvote数排序（降序）
        papers.sort((a, b) => parseInt(b['Upvote数'] || 0) - parseInt(a['Upvote数'] || 0));
        
        // 显示论文卡片
        displayHuggingFacePapers(papers);
    } catch (error) {
        console.error('加载HuggingFace论文时出错:', error);
        const container = document.getElementById('huggingface-papers-container');
        if (container) {
            container.innerHTML = '<div class="alert alert-danger">加载HuggingFace论文失败: ' + error.message + '</div>';
        }
    }
}

// 完全重写的CSV解析函数，正确处理多行字段
function parseHuggingFaceCSV(csvText) {
    console.log('开始解析HuggingFace CSV，总长度:', csvText.length);
    
    // 预处理：规范化行尾
    csvText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    let position = 0;
    const length = csvText.length;
    
    // 解析第一行获取表头
    let headerLine = '';
    let inQuotes = false;
    
    while (position < length) {
        const char = csvText[position];
        headerLine += char;
        position++;
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === '\n' && !inQuotes) {
            break; // 找到表头行结束
        }
    }
    
    // 解析表头
    const headers = parseCSVRow(headerLine);
    console.log('解析到的表头:', headers);
    
    // 解析数据行
    const papers = [];
    let currentRow = '';
    inQuotes = false;
    
    while (position < length) {
        const char = csvText[position];
        position++;
        
        // 处理引号
        if (char === '"') {
            inQuotes = !inQuotes;
            currentRow += char;
        } 
        // 如果遇到行尾且不在引号内，或者到达文件末尾，则处理当前行
        else if ((char === '\n' && !inQuotes) || position >= length) {
            if (char === '\n') {
                currentRow += char;
            }
            
            // 跳过空行
            if (currentRow.trim() === '' || currentRow === '\n') {
                currentRow = '';
                continue;
            }
            
            // 解析当前行
            try {
                const values = parseCSVRow(currentRow);
                
                // 确保值的数量与表头匹配
                if (values.length > 0) {
                    // 创建论文对象
                    const paper = {};
                    
                    // 将每个值映射到对应的字段
                    for (let i = 0; i < headers.length; i++) {
                        const header = headers[i] ? headers[i].trim() : `column${i}`;
                        paper[header] = i < values.length ? values[i] : '';
                    }
                    
                    papers.push(paper);
                    console.log(`成功解析第${papers.length}篇论文: ${paper['标题'] ? paper['标题'].substring(0, 30) + '...' : '无标题'}`);
                }
            } catch (error) {
                console.error('解析行时出错:', error, '行内容:', currentRow.substring(0, 100) + '...');
            }
            
            currentRow = '';
        } else {
            currentRow += char;
        }
    }
    
    console.log(`CSV解析完成，共解析${papers.length}篇论文`);
    return papers;
}

// 解析单行CSV数据，正确处理引号内的逗号和换行
function parseCSVRow(row) {
    const result = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < row.length) {
        const char = row[i];
        
        if (char === '"') {
            // 检查是否是转义的引号 (""表示")
            if (inQuotes && i + 1 < row.length && row[i + 1] === '"') {
                current += '"';
                i += 2; // 跳过两个引号
            } else {
                // 切换引号状态
                inQuotes = !inQuotes;
                i++;
            }
        } else if (char === ',' && !inQuotes) {
            // 逗号分隔，但不在引号内
            result.push(current);
            current = '';
            i++;
        } else if (char === '\n' && !inQuotes) {
            // 行尾且不在引号内，结束解析
            break;
        } else {
            // 普通字符
            current += char;
            i++;
        }
    }
    
    // 添加最后一个字段
    result.push(current);
    
    // 清理每个字段（移除引号和多余空格）
    return result.map(field => {
        // 如果字段被引号包围，移除引号
        if (field.startsWith('"') && field.endsWith('"')) {
            field = field.substring(1, field.length - 1);
        }
        // 替换双引号转义
        return field.replace(/""/g, '"').trim();
    });
}

// 显示HuggingFace论文卡片
function displayHuggingFacePapers(papers) {
    const container = document.getElementById('huggingface-papers-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    papers.forEach(paper => {
        const paperCard = createHuggingFacePaperCard(paper);
        container.appendChild(paperCard);
    });
}

// 创建HuggingFace论文卡片
function createHuggingFacePaperCard(paper) {
    const col = document.createElement('div');
    col.className = 'col-12 mb-4';
    
    const card = document.createElement('div');
    card.className = 'article-card';
    
    // 创建卡片内容
    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';
    
    // 创建标题行
    const titleRow = document.createElement('div');
    titleRow.className = 'title-row';
    
    // 创建标题区域
    const titleArea = document.createElement('div');
    titleArea.className = 'article-header';
    
    // 创建标题链接 - 使用PDF链接
    const titleLink = document.createElement('a');
    titleLink.href = paper['PDF链接'] || '#'; // 使用PDF链接
    titleLink.target = '_blank';
    titleLink.className = 'article-title';
    titleLink.textContent = paper['标题'] || '无标题';
    
    // 创建中文标题（原标题）
    const originalTitle = document.createElement('div');
    originalTitle.className = 'original-title';
    originalTitle.textContent = paper['中文标题'] || '';
    
    // 将标题和原标题添加到标题区域
    titleArea.appendChild(titleLink);
    if (paper['中文标题']) {
        titleArea.appendChild(originalTitle);
    }
    
    // 创建标签容器
    const tagContainer = document.createElement('div');
    tagContainer.className = 'tag-container';
    
    // 添加领域标签
    if (paper['领域分类']) {
        const fieldTag = document.createElement('span');
        fieldTag.className = 'article-field';
        fieldTag.textContent = paper['领域分类'];
        tagContainer.appendChild(fieldTag);
    }
    
    // 添加研究机构标签（支持多个机构）
    if (paper['研究机构']) {
        // 创建机构标签容器
        const institutionTagsContainer = document.createElement('div');
        institutionTagsContainer.className = 'institution-tags';
        
        // 分割机构名称（按逗号分隔）
        const institutions = paper['研究机构'].split(',').map(inst => inst.trim()).filter(inst => inst);
        
        // 为每个机构创建标签
        institutions.forEach(institution => {
            const tagElement = document.createElement('span');
            tagElement.className = 'institution-tag';
            tagElement.textContent = institution;
            institutionTagsContainer.appendChild(tagElement);
        });
        
        tagContainer.appendChild(institutionTagsContainer);
    }
    
    // 添加Upvote数标签
    if (paper['Upvote数']) {
        const upvoteTag = document.createElement('span');
        upvoteTag.className = 'upvote-tag';
        upvoteTag.innerHTML = `<i class="fas fa-thumbs-up"></i> ${paper['Upvote数']}`;
        tagContainer.appendChild(upvoteTag);
    }
    
    // 将标题区域和标签容器添加到标题行
    titleRow.appendChild(titleArea);
    titleRow.appendChild(tagContainer);
    
    // 创建摘要预览
    const summaryPreview = document.createElement('div');
    summaryPreview.className = 'summary-preview';
    
    const summaryText = document.createElement('div');
    summaryText.className = 'summary-text';
    
    // 确保简明摘要存在
    const briefSummary = paper['简明摘要'] || '无摘要';
    
    // 移动设备显示更少字符
    const isMobile = window.innerWidth < 768;
    const maxLength = isMobile ? 40 : 60;
    
    // 使用简明摘要的前几个字符作为预览
    if (briefSummary.length > maxLength) {
        summaryText.textContent = briefSummary.substring(0, maxLength) + '...';
    } else {
        summaryText.textContent = briefSummary;
    }
    
    const toggleButton = document.createElement('button');
    toggleButton.className = 'toggle-summary-btn';
    toggleButton.textContent = '展开';
    toggleButton.onclick = function() {
        toggleHuggingFaceSummary(this, briefSummary); // 传递简明摘要而不是完整摘要
    };
    
    summaryPreview.appendChild(summaryText);
    summaryPreview.appendChild(toggleButton);
    
    // 将所有元素添加到卡片
    cardBody.appendChild(titleRow);
    cardBody.appendChild(summaryPreview);
    card.appendChild(cardBody);
    col.appendChild(card);
    
    return col;
}

// 切换HuggingFace论文摘要显示
function toggleHuggingFaceSummary(button, fullSummary) {
    const summaryPreview = button.parentElement;
    const cardBody = summaryPreview.parentElement;
    
    if (button.textContent === '展开') {
        // 创建完整摘要容器
        const summaryContainer = document.createElement('div');
        summaryContainer.className = 'summary-container';
        
        const summaryContent = document.createElement('div');
        summaryContent.className = 'summary-content';
        summaryContent.textContent = fullSummary || '无摘要';
        
        const collapseButton = document.createElement('button');
        collapseButton.className = 'collapse-summary-btn';
        collapseButton.textContent = '收起';
        collapseButton.onclick = function() {
            // 移除完整摘要容器
            summaryContainer.remove();
            // 显示摘要预览
            summaryPreview.style.display = 'flex';
            button.textContent = '展开';
        };
        
        summaryContainer.appendChild(summaryContent);
        summaryContainer.appendChild(collapseButton);
        
        // 隐藏预览，显示完整摘要
        summaryPreview.style.display = 'none';
        cardBody.appendChild(summaryContainer);
    }
}