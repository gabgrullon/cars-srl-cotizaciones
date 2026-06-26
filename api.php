<?php
header('Content-Type: application/json; charset=utf-8');

$WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzfVXDxac7cfsyronxUB8Kl9-8ySmB7wpi8BeyE3y6VDdBu_VrkWSxUcFLl9qqZpI6P/exec';

// Opcional: coloca un PIN para que solo tu página cree cotizaciones.
// Si no quieres PIN, deja vacío.
$APP_PIN = '';

function responder_error($codigo, $mensaje) {
  http_response_code($codigo);
  echo json_encode([
    'ok' => false,
    'error' => $mensaje
  ]);
  exit;
}

function llamar_url($url, $postData = null) {
  $ch = curl_init($url);

  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
  curl_setopt($ch, CURLOPT_TIMEOUT, 120);

  if ($postData !== null) {
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($postData));
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
  }

  $response = curl_exec($ch);
  $error = curl_error($ch);
  $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($error) {
    responder_error(500, $error);
  }

  http_response_code($status ?: 200);
  echo $response;
  exit;
}

// GET: pedir PDF temporal, listar cotizaciones o buscar clientes
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $action = isset($_GET['action']) ? $_GET['action'] : '';

  if ($action === 'listar') {
    $url = $WEB_APP_URL . '?action=listar';
    llamar_url($url);
  }

  if ($action === 'buscar_clientes') {
    $q = isset($_GET['q']) ? trim($_GET['q']) : '';
    $url = $WEB_APP_URL . '?action=buscar_clientes&q=' . urlencode($q);
    llamar_url($url);
  }

  if ($action === 'pdf') {
    $fileId = isset($_GET['fileId']) ? trim($_GET['fileId']) : '';
    $archivo = isset($_GET['archivo']) ? trim($_GET['archivo']) : 'cotizacion-cars';

    if ($fileId === '') {
      responder_error(400, 'Falta fileId');
    }

    $url = $WEB_APP_URL
      . '?action=pdf'
      . '&fileId=' . urlencode($fileId)
      . '&archivo=' . urlencode($archivo);

    llamar_url($url);
  }

  responder_error(400, 'Acción GET no válida');
}

// POST: crear cotización o guardar cliente
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $raw = file_get_contents('php://input');
  $payload = json_decode($raw, true);

  if (!$payload) {
    responder_error(400, 'JSON inválido');
  }

  if ($APP_PIN !== '') {
    if (!isset($payload['pin']) || $payload['pin'] !== $APP_PIN) {
      responder_error(403, 'PIN inválido');
    }
  }

  $data = isset($payload['data']) ? $payload['data'] : $payload;

  llamar_url($WEB_APP_URL, $data);
}

responder_error(405, 'Método no permitido');
?>
