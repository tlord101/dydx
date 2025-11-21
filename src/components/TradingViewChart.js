import React, { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';

const TradingViewChart = ({ symbol = 'BTC' }) => {
  const chartContainerRef = useRef();

  useEffect(() => {
    if (!chartContainerRef.current) return;

    try {
      const chart = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth,
        height: 280,
        layout: {
          backgroundColor: '#101014',
          textColor: '#888888',
        },
        grid: {
          vertLines: {
            color: '#1C1C28',
          },
          horzLines: {
            color: '#1C1C28',
          },
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          borderColor: '#1C1C28',
        },
        rightPriceScale: {
          borderColor: '#1C1C28',
        },
        crosshair: {
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

      const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#00D395',
        downColor: '#FF4D4D',
        borderVisible: false,
        wickUpColor: '#00D395',
        wickDownColor: '#FF4D4D',
      });

      const volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: '',
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });

      // Generate mock data
      const data = [];
      const volumeData = [];
      let time = Math.floor(Date.now() / 1000) - 86400;
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

        time += 900;
      }

      candlestickSeries.setData(data);
      volumeSeries.setData(volumeData);
      chart.timeScale().fitContent();

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
    } catch (error) {
      console.error('Error creating chart:', error);
      return () => {};
    }
  }, []);

  return <div ref={chartContainerRef} className="w-full" />;
};

export default TradingViewChart;
