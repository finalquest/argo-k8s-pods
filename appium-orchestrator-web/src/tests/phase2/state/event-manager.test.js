import {
  EventManager,
  globalEvents,
  EventError,
} from '@public/js/state/event-manager.js';

describe('Event Manager', () => {
  let eventManager;

  beforeEach(() => {
    eventManager = new EventManager({ debug: false });
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('inicializa con valores por defecto', () => {
      expect(eventManager.events).toBeInstanceOf(Map);
      expect(eventManager.onceEvents).toBeInstanceOf(Set);
      expect(eventManager.maxListeners).toBe(100);
      expect(eventManager.debugMode).toBe(false);
    });

    test('inicializa con opciones personalizadas', () => {
      const manager = new EventManager({
        maxListeners: 50,
        debug: true,
      });

      expect(manager.maxListeners).toBe(50);
      expect(manager.debugMode).toBe(true);
    });
  });

  describe('on()', () => {
    test('registra listener correctamente', () => {
      const listener = jest.fn();
      const unsubscribe = eventManager.on('test:event', listener);

      expect(typeof unsubscribe).toBe('function');
      expect(eventManager.hasListeners('test:event')).toBe(true);
      expect(eventManager.listenerCount('test:event')).toBe(1);
    });

    test('retorna función de unsuscribe funcional', () => {
      const listener = jest.fn();
      const unsubscribe = eventManager.on('test:event', listener);

      unsubscribe();

      expect(eventManager.hasListeners('test:event')).toBe(false);
    });

    test('puede registrar múltiples listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      eventManager.on('test:event', listener1);
      eventManager.on('test:event', listener2);

      expect(eventManager.listenerCount('test:event')).toBe(2);
    });

    test('lanza error con máximo de listeners', () => {
      const manager = new EventManager({ maxListeners: 1 });
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      manager.on('test:event', listener1);

      expect(() => manager.on('test:event', listener2)).toThrow(EventError);
    });
  });

  describe('once()', () => {
    test('ejecuta listener solo una vez', () => {
      const listener = jest.fn();
      eventManager.once('test:event', listener);

      eventManager.emit('test:event', 'data1');
      eventManager.emit('test:event', 'data2');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith('data1', expect.any(Object));
    });

    test('remueve listener después de ejecutar', () => {
      const listener = jest.fn();
      eventManager.once('test:event', listener);

      eventManager.emit('test:event', 'data');

      expect(eventManager.hasListeners('test:event')).toBe(false);
    });
  });

  describe('emit()', () => {
    test('emite evento y ejecuta listeners', () => {
      const listener = jest.fn();
      eventManager.on('test:event', listener);

      const result = eventManager.emit('test:event', 'test data');

      expect(result).toBe(1);
      expect(listener).toHaveBeenCalledWith(
        'test data',
        expect.objectContaining({
          event: 'test:event',
          data: 'test data',
        }),
      );
    });

    test('retorna 0 si no hay listeners', () => {
      const result = eventManager.emit('nonexistent:event', 'data');

      expect(result).toBe(0);
    });

    test('maneja errores en listeners', () => {
      const errorListener = jest.fn(() => {
        throw new Error('Listener error');
      });
      const normalListener = jest.fn();

      eventManager.on('test:event', errorListener);
      eventManager.on('test:event', normalListener);

      const result = eventManager.emit('test:event', 'data');

      expect(result).toBe(1); // Solo el listener exitoso
      expect(normalListener).toHaveBeenCalled();
    });
  });

  describe('off()', () => {
    test('remueve listener específico', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      eventManager.on('test:event', listener1);
      eventManager.on('test:event', listener2);

      eventManager.off('test:event', listener1);

      expect(eventManager.listenerCount('test:event')).toBe(1);
    });

    test('retorna false si listener no encontrado', () => {
      const result = eventManager.off('nonexistent:event', jest.fn());

      expect(result).toBe(false);
    });
  });

  describe('removeAllListeners()', () => {
    test('remueve todos los listeners de un evento', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      eventManager.on('test:event', listener1);
      eventManager.on('test:event', listener2);
      eventManager.on('other:event', listener1);

      eventManager.removeAllListeners('test:event');

      expect(eventManager.listenerCount('test:event')).toBe(0);
      expect(eventManager.listenerCount('other:event')).toBe(1);
    });

    test('remueve todos los listeners si no se especifica evento', () => {
      eventManager.on('test:event', jest.fn());
      eventManager.on('other:event', jest.fn());

      eventManager.removeAllListeners();

      expect(eventManager.listenerCount()).toBe(0);
    });
  });

  describe('utility methods', () => {
    test('listenerCount() funciona', () => {
      eventManager.on('event1', jest.fn());
      eventManager.on('event1', jest.fn());
      eventManager.on('event2', jest.fn());

      expect(eventManager.listenerCount('event1')).toBe(2);
      expect(eventManager.listenerCount('event2')).toBe(1);
      expect(eventManager.listenerCount('nonexistent')).toBe(0);
      expect(eventManager.listenerCount()).toBe(3);
    });

    test('eventNames() retorna nombres de eventos', () => {
      eventManager.on('event1', jest.fn());
      eventManager.on('event2', jest.fn());

      const names = eventManager.eventNames();

      expect(names).toContain('event1');
      expect(names).toContain('event2');
    });

    test('hasListeners() verifica si hay listeners', () => {
      eventManager.on('test:event', jest.fn());

      expect(eventManager.hasListeners('test:event')).toBe(true);
      expect(eventManager.hasListeners('nonexistent')).toBe(false);
    });
  });

  describe('EventError', () => {
    test('crea EventError con parámetros completos', () => {
      const error = new EventError(
        'Test error',
        'test:event',
        'test.operation',
      );

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('EventError');
      expect(error.event).toBe('test:event');
      expect(error.operation).toBe('test.operation');
    });
  });

  describe('globalEvents instance', () => {
    test('instancia global está disponible', () => {
      expect(globalEvents).toBeInstanceOf(EventManager);
      expect(globalEvents.maxListeners).toBe(50);
    });
  });
});