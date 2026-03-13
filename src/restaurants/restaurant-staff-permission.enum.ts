/**
 * Permisos que un administrador de restaurante puede otorgar a su personal.
 * Un staff solo puede recibir permisos que el admin otorgante posea o menos.
 */
export enum RestaurantStaffPermission {
  /** Crear y editar ítems y categorías del menú */
  MANAGE_MENU = 'manage_menu',
  /** Ver y actualizar el estado de las órdenes */
  MANAGE_ORDERS = 'manage_orders',
  /** Solo visualizar órdenes, sin modificarlas */
  VIEW_ORDERS = 'view_orders',
  /** Actualizar horarios de atención del restaurante */
  MANAGE_SCHEDULE = 'manage_schedule',
  /** Editar datos del restaurante (nombre, descripción, dirección…) */
  MANAGE_RESTAURANT = 'manage_restaurant',
  /** Crear y gestionar personal (solo si el propio admin tiene este permiso) */
  MANAGE_STAFF = 'manage_staff',
}

export const ALL_STAFF_PERMISSIONS = Object.values(RestaurantStaffPermission);
