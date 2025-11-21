import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';

const TradingViewChart = ({ symbol = 'BTC' }) => {
  const chartContainerRef = useRef();
  const chartRef = useRef();
  const candlestickSeriesRef = useRef();
  const volumeSeriesRef = useRef();

  // Mock data generator
  const generateMockData = () => {
    const data = [];
    const volumeData = [];
    let time = Math.floor(Date.now() / 1000) - 86400; // 24 hours ago
    let close = 87000;

    for (let i = 0; i < 100; i++) {
      const open = close;
      const change = (Math.random() - 0.48) * 500;
      close = open + change;
      const high = Math.max(open, close) + Math.random() * 200;
      const low = Math.min(open, close) - Math.random() * 200;

      data.push({
        time: time,
        open: open,
        high: high,
        low: low,
        close: close
      });

      volumeData.push({
        time: time,
        value: Math.random() * 1000000 + 500000,
        color: change > 0 ? 'rgba(0, 211, 149, 0.5)' : 'rgba(255, 77, 77, 0.5)'
      });

      time += 900; // 15 minutes
    }

    return { data, volumeData };
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#101014' },
        textColor: '#888888',
      },
      grid: {
        vertLines: { color: '#1C1C28' },
        horzLines: { color: '#1C1C28' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 280,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#1C1C28',
      },
      rightPriceScale: {
        borderColor: '#1C1C28',
      },
      crosshair: {
        mode: 1,
        vertLine: {
          width: 1,
          color: '#6669FF',
          style: 1,
        },
        horzLine: {
          width: 1,
          color: '#6669FF',
          style: 1,
        },
      },
    });

    chartRef.current = chart;

    try {
      // Create candlestick series
      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#00D395',
        downColor: '#FF4D4D',
        borderVisible: false,
        wickUpColor: '#00D395',
        wickDownColor: '#FF4D4D',
      });

      candlestickSeriesRef.current = candlestickSeries;

      // Create volume series
      const volumeSeries = chart.addHistogramSeries({
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: '',
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });

      volumeSeriesRef.current = volumeSeries;

      // Set data
      const { data, volumeData } = generateMockData();
      candlestickSeries.setData(data);
      volumeSeries.setData(volumeData);

      // Fit content
      chart.timeScale().fitContent();
    } catch (error) {
      console.error('Error creating chart series:', error);
    }

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  return <div ref={chartContainerRef} className="w-full" />;
};

export default TradingViewChart;
