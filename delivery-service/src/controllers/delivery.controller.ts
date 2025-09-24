import { Request, Response } from "express";
import { sendEmail } from "../services/email.service";
import {
  findAvailableDriver,
  markDriverAvailability,
} from "../services/driver.service";
import {
  createDelivery,
  findDeliveryByOrderId,
  updateDeliveryAcceptance,
  findAssignedDeliveriesForDriver,
  findAllDeliveriesForDriver,
  updateDeliveryStatusById,
} from "../services/delivery.service";
import { Driver } from "../models/driver.model";
import axios from "axios";
import { Delivery } from "../models/delivery.model";
import { sendSMS } from "../services/sms.service";

import logger from "../utils/logger";
import { sanitizeForLog } from "../utils/sanitize";

const ORDER_SERVICE_BASE_URL = "http://localhost:3002/api/orders";
const USER_SERVICE_BASE_URL = "http://localhost:3003/api/auth";

/**
 * Assign driver automatically
 */
export const assignDriverAutomatically = async (
  req: Request,
  res: Response
) => {
  const { orderId, customerId, restaurantId } = req.body;

  // Log only whitelisted, sanitized fields
  const safeInput = sanitizeForLog({ orderId, customerId, restaurantId });
  logger.info({ req: { method: req.method, url: req.url }, input: safeInput }, "Received assignDriverAutomatically request");

  try {
    const restaurantRes = await axios.get(
      `http://localhost:3001/api/restaurants/${restaurantId}`
    ); //3001
    const restaurant = restaurantRes.data;

    if (!restaurant.available) {
      logger.info({ restaurant: sanitizeForLog({ id: restaurantId, available: restaurant?.available }) }, "Restaurant not available");
      return res.status(400).json({ message: "Restaurant not available" });
    }

    const orderRes = await axios.get(`${ORDER_SERVICE_BASE_URL}/${orderId}`);
    const order = orderRes.data;

    const driver = await findAvailableDriver(
      restaurant.location,
      order.deliveryAddress.city
    );

    if (!driver) {
      logger.info({ restaurantLocation: sanitizeForLog(restaurant.location), deliveryCity: sanitizeForLog(order.deliveryAddress?.city) }, "No matching driver available");
      return res.status(404).json({ message: "No matching driver available" });
    }

    const delivery = await createDelivery({
      orderId,
      customerId,
      restaurantLocation: restaurant.location,
      deliveryLocation: order.deliveryAddress.city,
      driverId: driver._id.toString(),
    });

    await markDriverAvailability(driver._id.toString(), false);

    logger.info({ delivery: sanitizeForLog({ id: delivery._id, orderId: delivery.orderId, driverId: delivery.driverId }) }, "Driver assigned");

    res.status(200).json({ message: "Driver assigned", delivery });
  } catch (error: any) {
    // Log only the error message to avoid dumping stack/PII to logs visible to users
    logger.error({ err: sanitizeForLog(error?.message || String(error)) }, "Error assigning driver");
    res.status(500).json({ message: "Error assigning driver", error: error?.message });
  }
};

/**
 * Respond to assignment (accept/decline)
 */
export const respondToAssignment = async (req: Request, res: Response) => {
  const { orderId, action } = req.body;
  logger.info({ req: { method: req.method, url: req.url }, input: sanitizeForLog({ orderId, action }) }, "Respond to assignment");

  try {
    const delivery = await findDeliveryByOrderId(orderId);
    if (!delivery) {
      logger.info({ orderId: sanitizeForLog(orderId) }, "Delivery not found for respondToAssignment");
      return res.status(404).json({ message: "Delivery not found" });
    }

    await updateDeliveryAcceptance(delivery, action);

    if (action === "decline") {
      logger.info({ deliveryId: sanitizeForLog(delivery._id) }, "Driver declined, attempting to reassign...");

      try {
        const orderRes = await axios.get(`${ORDER_SERVICE_BASE_URL}/${orderId}`);
        const order = orderRes.data;

        const newDriver = await findAvailableDriver(
          delivery.restaurantLocation,
          order.deliveryAddress.city
        );

        if (newDriver) {
          logger.info({ newDriverId: sanitizeForLog(newDriver._id) }, "Found another driver");

          // Assign delivery to new driver
          delivery.driverId = newDriver._id.toString();
          delivery.acceptStatus = "Pending";
          delivery.status = "Assigned";
          await delivery.save();

          await markDriverAvailability(newDriver._id.toString(), false);

          return res.status(200).json({
            message: "Delivery reassigned to another driver",
            delivery,
          });
        } else {
          logger.info({ deliveryId: sanitizeForLog(delivery._id) }, "No available driver to reassign");
          // Delivery remains pending without a driver
          delivery.driverId = undefined;
          delivery.acceptStatus = "Pending";
          delivery.status = "Pending";
          await delivery.save();

          return res.status(200).json({
            message: "No driver available to reassign. Delivery pending.",
            delivery,
          });
        }
      } catch (error: any) {
        logger.error({ err: sanitizeForLog(error?.message || String(error)) }, "Error during reassignment");
        return res.status(500).json({
          message: "Error reassigning delivery",
          error: error?.message,
        });
      }
    }

    // Normal accept case
    logger.info({ deliveryId: sanitizeForLog(delivery._id), action: sanitizeForLog(action) }, "Assignment response processed");
    return res.status(200).json({ message: `Assignment ${action}ed`, delivery });
  } catch (error: any) {
    logger.error({ err: sanitizeForLog(error?.message || String(error)) }, "Error responding to assignment");
    res.status(500).json({
      message: "Error responding to assignment",
      error: error?.message,
    });
  }
};

/**
 * Get assigned orders for the authenticated driver
 */
export const getAssignedOrders = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    logger.info({ userId: sanitizeForLog(userId) }, "Get assigned orders - token userId");

    // 1️⃣ Find Driver by userId
    const driver = await Driver.findOne({ userId });
    if (!driver) {
      logger.info({ userId: sanitizeForLog(userId) }, "Driver not found");
      return res.status(404).json({ message: "Driver not found" });
    }

    logger.info({ driverId: sanitizeForLog(driver._id) }, "Driver found - fetching assigned deliveries");

    // 2️⃣ Find assigned deliveries
    const deliveries = await findAssignedDeliveriesForDriver(driver._id.toString());

    // 3️⃣ Fetch full deliveryAddress for each order
    const enhancedDeliveries = await Promise.all(
      deliveries.map(async (delivery) => {
        try {
          const orderRes = await axios.get(`${ORDER_SERVICE_BASE_URL}/${delivery.orderId}`);
          const order = orderRes.data;

          return {
            ...delivery.toObject(), // convert mongoose document to plain object
            deliveryAddress: order.deliveryAddress || null,
            paymentStatus: order.paymentStatus || null,
            customerId: order.userId || null,
            restaurantId: order.restaurantId || null,
            specialInstructions: order.specialInstructions || "",
          };
        } catch (err: any) {
          logger.error({ err: sanitizeForLog(err?.message || String(err)), orderId: sanitizeForLog(delivery.orderId) }, "Failed fetching order");
          return {
            ...delivery.toObject(),
            deliveryAddress: null,
          };
        }
      })
    );

    res.status(200).json(enhancedDeliveries);
  } catch (error: any) {
    logger.error({ err: sanitizeForLog(error?.message || String(error)) }, "Error fetching assigned deliveries");
    res.status(500).json({
      message: "Error fetching assigned deliveries",
      error: error.message,
    });
  }
};

// ✅ Fetch All My Deliveries (Ongoing + Completed)
export const getMyDeliveries = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    logger.info({ userId: sanitizeForLog(userId) }, "Get my deliveries - token userId");

    const driver = await Driver.findOne({ userId });

    if (!driver) {
      logger.info({ userId: sanitizeForLog(userId) }, "Driver not found in getMyDeliveries");
      return res.status(404).json({ message: "Driver not found" });
    }

    const deliveries = await findAllDeliveriesForDriver(driver._id.toString());

    const enhancedDeliveries = await Promise.all(
      deliveries.map(async (delivery) => {
        try {
          const orderRes = await axios.get(`${ORDER_SERVICE_BASE_URL}/${delivery.orderId}`);
          const order = orderRes.data;

          return {
            ...delivery.toObject(),
            deliveryAddress: order.deliveryAddress || null,
          };
        } catch (err: any) {
          logger.error({ err: sanitizeForLog(err?.message || String(err)), orderId: sanitizeForLog(delivery.orderId) }, "Failed fetching order in getMyDeliveries");
          return {
            ...delivery.toObject(),
            deliveryAddress: null,
          };
        }
      })
    );

    res.status(200).json(enhancedDeliveries);
  } catch (error: any) {
    logger.error({ err: sanitizeForLog(error?.message || String(error)) }, "Error fetching deliveries");
    res.status(500).json({ message: "Error fetching deliveries", error: error.message });
  }
};

// ✅ Update Delivery Status
export const updateDeliveryStatus = async (req: Request, res: Response) => {
  try {
    const { deliveryId } = req.params;
    const { status } = req.body;

    const allowedStatuses = ["PickedUp", "Delivered", "Cancelled"];
    if (!allowedStatuses.includes(status)) {
      logger.info({ deliveryId: sanitizeForLog(deliveryId), status: sanitizeForLog(status) }, "Invalid status in updateDeliveryStatus");
      return res.status(400).json({ message: "Invalid status" });
    }

    const updatedDelivery = await updateDeliveryStatusById(deliveryId, status);
    if (!updatedDelivery) {
      logger.info({ deliveryId: sanitizeForLog(deliveryId) }, "Delivery not found in updateDeliveryStatus");
      return res.status(404).json({ message: "Delivery not found" });
    }

    // Step 2: If the status is "Delivered", send an email to the customer
    if (status === "Delivered") {
      // Fetch the order details to get the userId
      logger.info({ deliveryId: sanitizeForLog(updatedDelivery._id) }, "Fetching order details for delivered status");
      const orderRes = await axios.get(`${ORDER_SERVICE_BASE_URL}/${updatedDelivery.orderId}`);
      const order = orderRes.data;
      logger.info({ orderId: sanitizeForLog(order._id || updatedDelivery.orderId) }, "Order fetched for delivery");

      // Fetch the customer details from the user service using userId
      const userRes = await axios.get(`${USER_SERVICE_BASE_URL}/${order.userId}`);
      const user = userRes.data;
      logger.info({ userId: sanitizeForLog(order.userId) }, "User fetched for delivery notification");

      // Email details
      const customerEmail = "dev40.emailtest@gmail.com";
      const customerName = user.name;
      const deliveryAddress = order.deliveryAddress;
      const customerPhone = "+94778964821"; // change to user phone number if available

      const subject = `Your Order with HungerJet has been Delivered!`;
      const text = `
        Hello ${customerName},\n\n
        We are happy to inform you that your order with HungerJet has been successfully delivered to your address: 
        ${deliveryAddress?.street}, ${deliveryAddress?.city}.\n\n
        Thank you for choosing HungerJet, and we look forward to serving you again soon!\n\n
        Best regards,\n
        HungerJet Team
      `;

      const message = `Hello, your order has been delivered to ${deliveryAddress?.street}, ${deliveryAddress?.city}. Thank you for choosing HungerJet!`;

      // Send the email to the customer
      if (customerEmail) {
        logger.info({ to: sanitizeForLog(customerEmail) }, "Sending email to customer");
        await sendEmail(customerEmail, subject, text);
      }
      // Send SMS if the phone number exists
      if (customerPhone) {
        logger.info({ to: sanitizeForLog(customerPhone) }, "Sending SMS to customer");
        await sendSMS(customerPhone, message);
      }
    }

    logger.info({ deliveryId: sanitizeForLog(updatedDelivery._id), status: sanitizeForLog(status) }, "Delivery status updated");
    res.status(200).json({
      message: "Delivery status updated successfully",
      updatedDelivery,
    });
  } catch (error: any) {
    logger.error({ err: sanitizeForLog(error?.message || String(error)) }, "Error updating delivery status");
    res.status(500).json({
      message: "Error updating delivery status",
      error: error.message,
    });
  }
};
