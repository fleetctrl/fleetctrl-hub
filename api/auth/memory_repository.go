package auth

import (
	"context"
	"errors"
	"sync"
)

// MemoryRepository is an in-memory implementation of DeviceRepository.
type MemoryRepository struct {
	mu      sync.Mutex
	devices map[string]*Device
}

// NewMemoryRepository returns a MemoryRepository.
func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{devices: make(map[string]*Device)}
}

// GetDevice retrieves a device by ID.
func (m *MemoryRepository) GetDevice(ctx context.Context, id string) (*Device, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	d, ok := m.devices[id]
	if !ok {
		return nil, errors.New("device not found")
	}
	return d, nil
}

// SaveDevice stores a device.
func (m *MemoryRepository) SaveDevice(ctx context.Context, d *Device) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.devices[d.ID] = d
	return nil
}
