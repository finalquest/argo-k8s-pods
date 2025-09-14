// Gherkin Keyword Hint Provider
// Proporciona suggestions de palabras clave Gherkin para autocompletado

class GherkinKeywordHintProvider {
  constructor() {
    this.type = 'keyword';
    this.keywords = [
      // Keywords principales
      { text: 'Feature', description: 'Define una característica del sistema' },
      { text: 'Scenario', description: 'Define un escenario de prueba' },
      { text: 'Given', description: 'Establece el contexto inicial' },
      { text: 'When', description: 'Describe la acción a realizar' },
      { text: 'Then', description: 'Verifica el resultado esperado' },
      { text: 'And', description: 'Añade condiciones adicionales' },
      { text: 'But', description: 'Añade condiciones alternativas' },

      // Keywords estructurales
      {
        text: 'Background',
        description: 'Define pasos comunes a todos los escenarios',
      },
      {
        text: 'Scenario Outline',
        description: 'Define una plantilla de escenario',
      },
      {
        text: 'Examples',
        description: 'Proporciona ejemplos para Scenario Outline',
      },
      { text: 'Rule', description: 'Agrupa escenarios relacionados' },

      // Keywords de documentación
      { text: '"""', description: 'Inicia un bloque de texto multilínea' },
      { text: '|', description: 'Separador para tablas de datos' },

      // Keywords de configuración
      { text: '# language:', description: 'Especifica el idioma del feature' },
      { text: '@', description: 'Inicia un tag' },
    ];
  }

  async getHints(context) {
    const hints = [];
    const currentWord = context.currentWord
      ? context.currentWord.toLowerCase()
      : '';

    // Filtrar keywords relevantes para el contexto actual
    const relevantKeywords = this.getRelevantKeywords(context);

    for (const keyword of relevantKeywords) {
      // Verificar que keyword tenga las propiedades necesarias
      if (!keyword || !keyword.text) {
        continue;
      }

      // Filtrar por coincidencia con palabra actual
      if (currentWord && !keyword.text.toLowerCase().startsWith(currentWord)) {
        continue;
      }

      hints.push({
        text: keyword.text,
        displayText: keyword.text,
        type: 'keyword',
        description: keyword.description,
        score: this.calculateKeywordScore(keyword, context),
      });
    }

    // Ordenar por score y limitar resultados
    const sortedHints = hints.sort((a, b) => b.score - a.score);
    const limitedHints = sortedHints.slice(0, 10); // Limitar a 10 resultados

    return {
      list: limitedHints,
      from: this.getHintPosition(context),
      to: this.getHintEndPosition(context),
    };
  }

  getRelevantKeywords(context) {
    const lineText = context.lineText.trim();
    const previousLines = context.previousLines;

    // Keywords que siempre están disponibles (filtrar del array completo)
    const alwaysAvailableTexts = [
      'Feature',
      'Scenario',
      'Background',
      'Rule',
      '@',
    ];
    const stepKeywordsTexts = ['Given', 'When', 'Then', 'And', 'But'];
    const structuralKeywordsTexts = [
      'Scenario Outline',
      'Examples',
      '"""',
      '|',
    ];

    // Detectar el contexto basado en el contenido del archivo
    const hasFeature = previousLines.some((line) =>
      line.trim().startsWith('Feature:'),
    );
    const hasScenario = previousLines.some((line) =>
      line.trim().startsWith('Scenario:'),
    );

    // Función auxiliar para filtrar keywords por textos
    const filterKeywordsByTexts = (texts) => {
      return this.keywords.filter(
        (keyword) => keyword && texts.includes(keyword.text),
      );
    };

    // Si la línea está vacía o solo tiene espacios
    if (!lineText || lineText.length <= 1) {
      if (!hasFeature) {
        return filterKeywordsByTexts(['Feature', '@']);
      } else if (!hasScenario) {
        return filterKeywordsByTexts(['Scenario', 'Background', 'Rule', '@']);
      } else {
        return filterKeywordsByTexts([
          ...stepKeywordsTexts,
          ...structuralKeywordsTexts,
        ]);
      }
    }

    // Si la línea ya empieza con un texto
    if (lineText.length > 0) {
      const firstWord = lineText.split(' ')[0];

      // Si ya hay un keyword step, ofrecer And/But
      if (stepKeywordsTexts.includes(firstWord)) {
        return filterKeywordsByTexts(['And', 'But']);
      }

      // Si hay Feature, ofrecer estructurales
      if (firstWord === 'Feature:') {
        return filterKeywordsByTexts(['Background', 'Scenario', 'Rule', '@']);
      }

      // Si hay Scenario, ofrecer steps
      if (firstWord === 'Scenario:' || firstWord === 'Scenario Outline:') {
        return filterKeywordsByTexts(stepKeywordsTexts);
      }
    }

    // Por defecto, ofrecer todos los keywords relevantes
    return filterKeywordsByTexts([
      ...alwaysAvailableTexts,
      ...stepKeywordsTexts,
      ...structuralKeywordsTexts,
    ]);
  }

  calculateKeywordScore(keyword, context) {
    let score = 0;

    // Score base por tipo de keyword
    const baseScores = {
      Feature: 100,
      Scenario: 90,
      Given: 80,
      When: 75,
      Then: 70,
      And: 65,
      But: 60,
      Background: 50,
      'Scenario Outline': 45,
      Examples: 40,
      Rule: 35,
      '@': 30,
      '"""': 25,
      '|': 20,
      '# language:': 15,
    };

    score += baseScores[keyword.text] || 10;

    // Score por coincidencia exacta con palabra actual
    if (context.currentWord) {
      const lowerKeyword = keyword.text.toLowerCase();
      const lowerCurrentWord = context.currentWord
        ? context.currentWord.toLowerCase()
        : '';

      if (lowerKeyword.startsWith(lowerCurrentWord)) {
        score += 50;
      }
    }

    // Score por contexto de línea
    const lineText = context.lineText.trim();
    const previousLines = context.previousLines;

    // Priorizar Feature si no hay Feature en el archivo
    if (
      keyword.text === 'Feature' &&
      !previousLines.some((line) => line.trim().startsWith('Feature:'))
    ) {
      score += 40;
    }

    // Priorizar Scenario si hay Feature pero no Scenario
    if (
      keyword.text === 'Scenario' &&
      previousLines.some((line) => line.trim().startsWith('Feature:')) &&
      !previousLines.some((line) => line.trim().startsWith('Scenario:'))
    ) {
      score += 30;
    }

    // Priorizar steps si hay Scenario
    if (
      ['Given', 'When', 'Then'].includes(keyword.text) &&
      previousLines.some((line) => line.trim().startsWith('Scenario:'))
    ) {
      score += 25;
    }

    // Priorizar And/But después de un step
    if (
      ['And', 'But'].includes(keyword.text) &&
      ['Given', 'When', 'Then', 'And', 'But'].some((k) =>
        lineText.startsWith(k.text),
      )
    ) {
      score += 20;
    }

    return score;
  }

  getHintPosition(context) {
    const line = context.line;
    const lineText = context.lineText;
    const cursor = context.ch;

    // Para keywords que van al inicio de la línea
    if (
      [
        'Feature',
        'Scenario',
        'Background',
        'Rule',
        'Scenario Outline',
      ].includes(context.currentWord)
    ) {
      return { line, ch: 0 };
    }

    // Para tags
    if (context.currentWord === '@') {
      return { line, ch: 0 };
    }

    // Para step keywords, posicionar al inicio de la línea si está vacía
    if (
      lineText.trim() === '' &&
      ['Given', 'When', 'Then', 'And', 'But'].includes(context.currentWord)
    ) {
      return { line, ch: 0 };
    }

    // Para otros casos, usar la posición actual del cursor
    return { line, ch: cursor - context.currentWord.length };
  }

  getHintEndPosition(context) {
    return context.codeMirror.getCursor();
  }

  // Manejar la inserción del keyword seleccionado
  handleHintInsertion(hint, context) {
    const cursor = context.codeMirror.getCursor();
    const fromPos = this.getHintPosition(context);
    const toPos = this.getHintEndPosition(context);

    // Formatear el keyword según el tipo
    let formattedText = hint.text;

    // Agregar dos puntos para keywords estructurales
    if (
      [
        'Feature',
        'Scenario',
        'Background',
        'Rule',
        'Scenario Outline',
      ].includes(hint.text)
    ) {
      formattedText += ': ';
    }
    // Agregar espacio para keywords de steps
    else if (['Given', 'When', 'Then', 'And', 'But'].includes(hint.text)) {
      formattedText += ' ';
    }
    // Para language tag, agregar espacio
    else if (hint.text === '# language:') {
      formattedText += ' ';
    }

    // Reemplazar el texto existente con el keyword formateado
    context.codeMirror.replaceRange(formattedText, fromPos, toPos);

    // Posicionar el cursor al final del keyword insertado
    const endPos = { line: cursor.line, ch: fromPos.ch + formattedText.length };
    context.codeMirror.setCursor(endPos);
  }

  destroy() {
    // Limpiar recursos si es necesario
  }
}

export default GherkinKeywordHintProvider;
