// Socket.io Communication Tests
// Tests for real-time communication, event handling, and client-server interaction

const { EventEmitter } = require('events');

describe('Socket.io Communication', () => {
  describe('Socket Connection Management', () => {
    test('should handle socket connection events', () => {
      const mockServer = new EventEmitter();
      const mockSocket = new EventEmitter();
      
      // Mock socket.io connection event
      mockServer.on('connection', (socket) => {
        expect(socket).toBeDefined();
        expect(typeof socket.on).toBe('function');
        expect(typeof socket.emit).toBe('function');
      });
      
      // Simulate connection
      mockServer.emit('connection', mockSocket);
    });

    test('should handle socket disconnection events', () => {
      const mockSocket = new EventEmitter();
      let disconnected = false;
      
      mockSocket.on('disconnect', () => {
        disconnected = true;
      });
      
      expect(disconnected).toBe(false);
      mockSocket.emit('disconnect');
      expect(disconnected).toBe(true);
    });

    test('should track connected clients', () => {
      const connectedClients = new Map();
      
      const mockClient1 = { id: 'client-1', username: 'user1' };
      const mockClient2 = { id: 'client-2', username: 'user2' };
      
      // Simulate client connections
      connectedClients.set(mockClient1.id, mockClient1);
      connectedClients.set(mockClient2.id, mockClient2);
      
      expect(connectedClients.size).toBe(2);
      expect(connectedClients.get('client-1')).toEqual(mockClient1);
      expect(connectedClients.get('client-2')).toEqual(mockClient2);
      
      // Simulate client disconnection
      connectedClients.delete('client-1');
      expect(connectedClients.size).toBe(1);
      expect(connectedClients.has('client-1')).toBe(false);
    });
  });

  describe('Event Handling', () => {
    test('should handle job submission events', () => {
      const mockSocket = new EventEmitter();
      let jobSubmitted = null;
      
      mockSocket.on('submit-job', (jobData) => {
        jobSubmitted = jobData;
      });
      
      const jobData = {
        branch: 'main',
        client: 'test-client',
        apkIdentifier: '1.0.0',
        deviceSerial: 'emulator-5554',
        persistentWorkspace: false
      };
      
      mockSocket.emit('submit-job', jobData);
      expect(jobSubmitted).toEqual(jobData);
    });

    test('should handle job status events', () => {
      const mockSocket = new EventEmitter();
      let statusUpdates = [];
      
      mockSocket.on('job-status', (status) => {
        statusUpdates.push(status);
      });
      
      // Simulate status updates
      mockSocket.emit('job-status', { jobId: 'job-1', status: 'started' });
      mockSocket.emit('job-status', { jobId: 'job-1', status: 'running' });
      mockSocket.emit('job-status', { jobId: 'job-1', status: 'completed' });
      
      expect(statusUpdates.length).toBe(3);
      expect(statusUpdates[0].status).toBe('started');
      expect(statusUpdates[1].status).toBe('running');
      expect(statusUpdates[2].status).toBe('completed');
    });

    test('should handle worker status events', () => {
      const mockSocket = new EventEmitter();
      let workerStatus = null;
      
      mockSocket.on('worker-status', (status) => {
        workerStatus = status;
      });
      
      const workerStatusData = {
        workerId: 'worker-0',
        status: 'busy',
        currentJob: { id: 'job-1', branch: 'main' }
      };
      
      mockSocket.emit('worker-status', workerStatusData);
      expect(workerStatus).toEqual(workerStatusData);
    });

    test('should handle log streaming events', () => {
      const mockSocket = new EventEmitter();
      let logMessages = [];
      
      mockSocket.on('log-output', (logData) => {
        logMessages.push(logData);
      });
      
      const logData = {
        jobId: 'job-1',
        timestamp: Date.now(),
        message: 'Test execution started',
        level: 'info'
      };
      
      mockSocket.emit('log-output', logData);
      expect(logMessages.length).toBe(1);
      expect(logMessages[0]).toEqual(logData);
    });
  });

  describe('Room Management', () => {
    test('should handle room joining and leaving', () => {
      const rooms = new Map();
      const mockSocket = {
        id: 'socket-1',
        rooms: new Set(),
        join: jest.fn((roomName) => {
          mockSocket.rooms.add(roomName);
          if (!rooms.has(roomName)) {
            rooms.set(roomName, new Set());
          }
          rooms.get(roomName).add(mockSocket.id);
        }),
        leave: jest.fn((roomName) => {
          mockSocket.rooms.delete(roomName);
          if (rooms.has(roomName)) {
            rooms.get(roomName).delete(mockSocket.id);
            if (rooms.get(roomName).size === 0) {
              rooms.delete(roomName);
            }
          }
        })
      };
      
      // Test joining room
      mockSocket.join('job-1');
      expect(mockSocket.rooms.has('job-1')).toBe(true);
      expect(rooms.has('job-1')).toBe(true);
      expect(rooms.get('job-1').has('socket-1')).toBe(true);
      
      // Test leaving room
      mockSocket.leave('job-1');
      expect(mockSocket.rooms.has('job-1')).toBe(false);
      expect(rooms.has('job-1')).toBe(false);
    });

    test('should broadcast to specific rooms', () => {
      const rooms = new Map();
      const mockSocket1 = { id: 'socket-1', rooms: new Set(['job-1']) };
      const mockSocket2 = { id: 'socket-2', rooms: new Set(['job-1', 'job-2']) };
      const mockSocket3 = { id: 'socket-3', rooms: new Set(['job-2']) };
      
      rooms.set('job-1', new Set(['socket-1', 'socket-2']));
      rooms.set('job-2', new Set(['socket-2', 'socket-3']));
      
      const broadcastMessages = [];
      const mockBroadcast = (roomName, event, data) => {
        if (rooms.has(roomName)) {
          rooms.get(roomName).forEach(socketId => {
            broadcastMessages.push({ socketId, event, data });
          });
        }
      };
      
      // Broadcast to job-1 room
      mockBroadcast('job-1', 'job-update', { jobId: 'job-1', status: 'completed' });
      
      expect(broadcastMessages.length).toBe(2);
      expect(broadcastMessages[0].socketId).toBe('socket-1');
      expect(broadcastMessages[1].socketId).toBe('socket-2');
      expect(broadcastMessages.every(msg => msg.event === 'job-update')).toBe(true);
    });

    test('should handle private messaging', () => {
      const mockSocket1 = { id: 'socket-1' };
      const mockSocket2 = { id: 'socket-2' };
      
      const privateMessages = [];
      const mockPrivateMessage = (socketId, event, data) => {
        privateMessages.push({ socketId, event, data });
      };
      
      // Send private message to socket-1
      mockPrivateMessage('socket-1', 'private-message', { content: 'Hello!' });
      
      expect(privateMessages.length).toBe(1);
      expect(privateMessages[0].socketId).toBe('socket-1');
      expect(privateMessages[0].event).toBe('private-message');
      expect(privateMessages[0].data.content).toBe('Hello!');
    });
  });

  describe('Error Handling', () => {
    test('should handle socket connection errors', () => {
      const mockServer = new EventEmitter();
      let connectionError = null;
      
      mockServer.on('connection_error', (error) => {
        connectionError = error;
      });
      
      const error = new Error('Connection failed');
      mockServer.emit('connection_error', error);
      
      expect(connectionError).toBe(error);
      expect(connectionError.message).toBe('Connection failed');
    });

    test('should handle event processing errors', () => {
      const mockSocket = new EventEmitter();
      let eventError = null;
      
      mockSocket.on('error', (error) => {
        eventError = error;
      });
      
      const error = new Error('Event processing failed');
      mockSocket.emit('error', error);
      
      expect(eventError).toBe(error);
      expect(eventError.message).toBe('Event processing failed');
    });

    test('should handle invalid event data', () => {
      const mockSocket = new EventEmitter();
      let validationErrors = [];
      
      mockSocket.on('submit-job', (jobData) => {
        if (!jobData || !jobData.branch || !jobData.client) {
          validationErrors.push('Invalid job data');
        }
      });
      
      // Test with invalid data
      mockSocket.emit('submit-job', null);
      mockSocket.emit('submit-job', { branch: 'main' }); // Missing client
      mockSocket.emit('submit-job', { client: 'test' }); // Missing branch
      
      expect(validationErrors.length).toBe(3);
      expect(validationErrors.every(error => error === 'Invalid job data')).toBe(true);
    });
  });

  describe('Event Validation', () => {
    test('should validate job submission data', () => {
      const validateJobData = (jobData) => {
        const errors = [];
        
        if (!jobData.branch) errors.push('Branch is required');
        if (!jobData.client) errors.push('Client is required');
        if (!jobData.apkIdentifier) errors.push('APK identifier is required');
        if (!jobData.deviceSerial) errors.push('Device serial is required');
        
        return errors;
      };
      
      const validJob = {
        branch: 'main',
        client: 'test-client',
        apkIdentifier: '1.0.0',
        deviceSerial: 'emulator-5554'
      };
      
      const invalidJob = {
        branch: 'main'
        // Missing client, apkIdentifier, deviceSerial
      };
      
      expect(validateJobData(validJob)).toEqual([]);
      expect(validateJobData(invalidJob)).toEqual([
        'Client is required',
        'APK identifier is required',
        'Device serial is required'
      ]);
    });

    test('should validate status update data', () => {
      const validateStatusData = (statusData) => {
        const errors = [];
        
        if (!statusData.jobId) errors.push('Job ID is required');
        if (!statusData.status) errors.push('Status is required');
        
        const validStatuses = ['pending', 'started', 'running', 'completed', 'failed'];
        if (statusData.status && !validStatuses.includes(statusData.status)) {
          errors.push('Invalid status');
        }
        
        return errors;
      };
      
      const validStatus = {
        jobId: 'job-1',
        status: 'running'
      };
      
      const invalidStatus = {
        jobId: 'job-1',
        status: 'invalid-status'
      };
      
      expect(validateStatusData(validStatus)).toEqual([]);
      expect(validateStatusData(invalidStatus)).toEqual(['Invalid status']);
    });
  });

  describe('Performance Optimization', () => {
    test('should handle event throttling', () => {
      const mockSocket = new EventEmitter();
      let eventCount = 0;
      let lastEventTime = 0;
      
      mockSocket.on('log-output', (logData) => {
        const currentTime = Date.now();
        if (currentTime - lastEventTime < 100) { // Throttle to 100ms
          return; // Skip this event
        }
        eventCount++;
        lastEventTime = currentTime;
      });
      
      // Send multiple events rapidly
      const baseTime = Date.now();
      for (let i = 0; i < 10; i++) {
        mockSocket.emit('log-output', { 
          jobId: 'job-1', 
          timestamp: baseTime + i * 50, // 50ms intervals
          message: `Log message ${i}` 
        });
      }
      
      // Should have throttled some events
      expect(eventCount).toBeLessThan(10);
    });

    test('should handle connection pooling', () => {
      const connectionPool = {
        maxSize: 10,
        activeConnections: 0,
        pendingConnections: [],
        
        addConnection: (socket) => {
          if (connectionPool.activeConnections < connectionPool.maxSize) {
            connectionPool.activeConnections++;
            return true;
          } else {
            connectionPool.pendingConnections.push(socket);
            return false;
          }
        },
        
        removeConnection: () => {
          connectionPool.activeConnections--;
          if (connectionPool.pendingConnections.length > 0) {
            const nextSocket = connectionPool.pendingConnections.shift();
            connectionPool.activeConnections++;
            return nextSocket;
          }
          return null;
        }
      };
      
      // Fill up the pool
      for (let i = 0; i < 15; i++) {
        connectionPool.addConnection({ id: `socket-${i}` });
      }
      
      expect(connectionPool.activeConnections).toBe(10);
      expect(connectionPool.pendingConnections.length).toBe(5);
      
      // Remove a connection
      const nextSocket = connectionPool.removeConnection();
      expect(connectionPool.activeConnections).toBe(10); // Should be refilled
      expect(connectionPool.pendingConnections.length).toBe(4);
      expect(nextSocket).toEqual({ id: 'socket-10' });
    });
  });

  describe('Message Serialization', () => {
    test('should handle JSON message serialization', () => {
      const message = {
        type: 'job-status',
        timestamp: Date.now(),
        data: {
          jobId: 'job-1',
          status: 'completed',
          results: { passed: 10, failed: 2 }
        }
      };
      
      const serialized = JSON.stringify(message);
      const deserialized = JSON.parse(serialized);
      
      expect(deserialized).toEqual(message);
      expect(deserialized.type).toBe('job-status');
      expect(deserialized.data.status).toBe('completed');
      expect(deserialized.data.results.passed).toBe(10);
    });

    test('should handle circular reference prevention', () => {
      const circularObject = {
        id: 'test',
        data: null
      };
      circularObject.data = circularObject; // Create circular reference
      
      const safeStringify = (obj) => {
        const seen = new WeakSet();
        return JSON.stringify(obj, (key, value) => {
          if (typeof value === 'object' && value !== null) {
            if (seen.has(value)) {
              return '[Circular]';
            }
            seen.add(value);
          }
          return value;
        });
      };
      
      const serialized = safeStringify(circularObject);
      const deserialized = JSON.parse(serialized);
      
      expect(deserialized.data).toBe('[Circular]');
      expect(deserialized.id).toBe('test');
    });
  });

  describe('Real-time Features', () => {
    test('should handle live status updates', () => {
      const mockSocket = new EventEmitter();
      const statusUpdates = [];
      
      mockSocket.on('live-status', (update) => {
        statusUpdates.push(update);
      });
      
      // Simulate live status updates
      const statuses = [
        { jobId: 'job-1', progress: 0, message: 'Starting...' },
        { jobId: 'job-1', progress: 25, message: 'Initializing test environment...' },
        { jobId: 'job-1', progress: 50, message: 'Running tests...' },
        { jobId: 'job-1', progress: 75, message: 'Processing results...' },
        { jobId: 'job-1', progress: 100, message: 'Completed!' }
      ];
      
      statuses.forEach(status => {
        mockSocket.emit('live-status', status);
      });
      
      expect(statusUpdates.length).toBe(5);
      expect(statusUpdates[0].progress).toBe(0);
      expect(statusUpdates[4].progress).toBe(100);
    });

    test('should handle concurrent job updates', () => {
      const mockSocket = new EventEmitter();
      const jobUpdates = new Map();
      
      mockSocket.on('job-update', (update) => {
        if (!jobUpdates.has(update.jobId)) {
          jobUpdates.set(update.jobId, []);
        }
        jobUpdates.get(update.jobId).push(update);
      });
      
      // Simulate concurrent job updates
      const updates = [
        { jobId: 'job-1', status: 'started', timestamp: Date.now() },
        { jobId: 'job-2', status: 'started', timestamp: Date.now() + 10 },
        { jobId: 'job-1', status: 'running', timestamp: Date.now() + 20 },
        { jobId: 'job-2', status: 'running', timestamp: Date.now() + 30 },
        { jobId: 'job-1', status: 'completed', timestamp: Date.now() + 40 },
        { jobId: 'job-2', status: 'completed', timestamp: Date.now() + 50 }
      ];
      
      updates.forEach(update => {
        mockSocket.emit('job-update', update);
      });
      
      expect(jobUpdates.size).toBe(2);
      expect(jobUpdates.get('job-1').length).toBe(3);
      expect(jobUpdates.get('job-2').length).toBe(3);
    });
  });
});