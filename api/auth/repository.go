package auth

import "context"

// DeviceRepository abstracts storage of devices and tokens.
type DeviceRepository interface {
	GetDevice(ctx context.Context, id string) (*Device, error)
	SaveDevice(ctx context.Context, d *Device) error
}
